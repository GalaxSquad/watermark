package kafka

import (
	"math/rand/v2"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

// expandableTokenSet documents the tokens ExpandVariables understands. Names are
// matched case-insensitively; values are generated freshly per call.
//
//	${UUID}          random UUID v4, unique per expansion
//	${GUID}          alias of UUID (v4)
//	${RANDOM_INT}    uniformly random integer in [0, 1000000)
//	${RANDOM_FLOAT}  uniformly random float in [0, 1) with 6 decimal places
//	${RANDOM_STRING} 16 random alphanumeric characters (A-Z a-z 0-9)
//	${TIMESTAMP}     current Unix time in seconds
//	${TIMESTAMP_MS}  current Unix time in milliseconds
//	${ISO_TIMESTAMP} current time as RFC3339 in UTC
//	${SEQUENCE}      the supplied sequence number (1-based during batch produce)
//
// Unknown tokens are kept literally in the output and reported once (deduped
// case-insensitively) in the returned unknown slice, using their original
// spelling including the surrounding "${" and "}". A token name must consist of
// letters, digits and underscores; an empty name ("${}"), a name containing
// other characters, and an unterminated "${" are all treated as literal text
// and are not reported as unknown variables.
//
// ExpandVariables has no mutable package state and is safe for concurrent use.
func ExpandVariables(input string, seq int) (expanded string, unknown []string) {
	if !strings.Contains(input, "${") {
		return input, nil
	}

	var out strings.Builder
	out.Grow(len(input))

	var seenUnknown map[string]struct{}
	rest := input

	for {
		start := strings.Index(rest, "${")
		if start < 0 {
			out.WriteString(rest)
			break
		}
		closeOffset := strings.Index(rest[start+2:], "}")
		if closeOffset < 0 {
			// Unterminated token: emit the remainder verbatim.
			out.WriteString(rest)
			break
		}
		end := start + 2 + closeOffset
		name := rest[start+2 : end]
		out.WriteString(rest[:start])

		if value, ok := expandVariable(name, seq); ok {
			out.WriteString(value)
		} else {
			out.WriteString(rest[start : end+1])
			if isVariableName(name) {
				if seenUnknown == nil {
					seenUnknown = make(map[string]struct{}, 1)
				}
				key := strings.ToLower(name)
				if _, dup := seenUnknown[key]; !dup {
					seenUnknown[key] = struct{}{}
					unknown = append(unknown, rest[start:end+1])
				}
			}
		}

		rest = rest[end+1:]
	}

	return out.String(), unknown
}

// isVariableName reports whether name looks like a variable token
// (letters, digits and underscores). Anything else is literal text rather than
// a reportable unknown token.
func isVariableName(name string) bool {
	if name == "" {
		return false
	}
	for i := range len(name) {
		c := name[i]
		isLetter := (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
		isDigit := c >= '0' && c <= '9'
		if !isLetter && !isDigit && c != '_' {
			return false
		}
	}
	return true
}

// expandVariable resolves a single token name to its generated value.
// The boolean result reports whether the name is supported.
func expandVariable(name string, seq int) (string, bool) {
	switch strings.ToUpper(name) {
	case "UUID", "GUID":
		return uuid.NewString(), true
	case "RANDOM_INT":
		return strconv.Itoa(rand.IntN(1000000)), true
	case "RANDOM_FLOAT":
		return strconv.FormatFloat(rand.Float64(), 'f', 6, 64), true
	case "RANDOM_STRING":
		return randomString(randomStringLength), true
	case "TIMESTAMP":
		return strconv.FormatInt(time.Now().Unix(), 10), true
	case "TIMESTAMP_MS":
		return strconv.FormatInt(time.Now().UnixMilli(), 10), true
	case "ISO_TIMESTAMP":
		return time.Now().UTC().Format(time.RFC3339), true
	case "SEQUENCE":
		return strconv.Itoa(seq), true
	default:
		return "", false
	}
}

const (
	randomStringLength  = 16
	randomStringCharset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
)

// randomString builds a random alphanumeric string of n characters.
func randomString(n int) string {
	var b strings.Builder
	b.Grow(n)
	for range n {
		b.WriteByte(randomStringCharset[rand.IntN(len(randomStringCharset))])
	}
	return b.String()
}
