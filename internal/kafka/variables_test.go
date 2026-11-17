package kafka

import (
	"regexp"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

var uuidV4Pattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

func TestExpandVariablesSupportedTokens(t *testing.T) {
	const seq = 42

	before := time.Now().Add(-time.Second)
	after := time.Now().Add(time.Second)

	expanded, unknown := ExpandVariables("${UUID}", seq)
	if len(unknown) != 0 {
		t.Fatalf("unexpected unknown tokens: %v", unknown)
	}
	if !uuidV4Pattern.MatchString(expanded) {
		t.Errorf("UUID: %q is not a v4 UUID", expanded)
	}

	expected := map[string]func(t *testing.T, value string){
		"GUID": func(t *testing.T, value string) {
			if !uuidV4Pattern.MatchString(value) {
				t.Errorf("GUID: %q is not a v4 UUID", value)
			}
		},
		"RANDOM_INT": func(t *testing.T, value string) {
			n, err := strconv.Atoi(value)
			if err != nil {
				t.Fatalf("RANDOM_INT: %q not an integer: %v", value, err)
			}
			if n < 0 || n >= 1000000 {
				t.Errorf("RANDOM_INT: %d out of range [0, 1000000)", n)
			}
		},
		"RANDOM_FLOAT": func(t *testing.T, value string) {
			f, err := strconv.ParseFloat(value, 64)
			if err != nil {
				t.Fatalf("RANDOM_FLOAT: %q not a float: %v", value, err)
			}
			if f < 0 || f >= 1 {
				t.Errorf("RANDOM_FLOAT: %v out of range [0, 1)", f)
			}
			if dot := strings.IndexByte(value, '.'); dot < 0 || len(value)-dot-1 != 6 {
				t.Errorf("RANDOM_FLOAT: %q does not have 6 decimals", value)
			}
		},
		"RANDOM_STRING": func(t *testing.T, value string) {
			if len(value) != 16 {
				t.Fatalf("RANDOM_STRING: length %d, want 16", len(value))
			}
			for _, r := range value {
				isDigit := r >= '0' && r <= '9'
				isUpper := r >= 'A' && r <= 'Z'
				isLower := r >= 'a' && r <= 'z'
				if !isDigit && !isUpper && !isLower {
					t.Errorf("RANDOM_STRING: %q contains non-alphanumeric %q", value, r)
				}
			}
		},
		"TIMESTAMP": func(t *testing.T, value string) {
			sec, err := strconv.ParseInt(value, 10, 64)
			if err != nil {
				t.Fatalf("TIMESTAMP: %q not an integer: %v", value, err)
			}
			if sec < before.Unix() || sec > after.Unix() {
				t.Errorf("TIMESTAMP: %d outside current window", sec)
			}
		},
		"TIMESTAMP_MS": func(t *testing.T, value string) {
			ms, err := strconv.ParseInt(value, 10, 64)
			if err != nil {
				t.Fatalf("TIMESTAMP_MS: %q not an integer: %v", value, err)
			}
			if ms < before.UnixMilli() || ms > after.UnixMilli() {
				t.Errorf("TIMESTAMP_MS: %d outside current window", ms)
			}
		},
		"ISO_TIMESTAMP": func(t *testing.T, value string) {
			ts, err := time.Parse(time.RFC3339, value)
			if err != nil {
				t.Fatalf("ISO_TIMESTAMP: %q not RFC3339: %v", value, err)
			}
			if ts.Before(before) || ts.After(after) {
				t.Errorf("ISO_TIMESTAMP: %s outside current window", value)
			}
			if ts.Location() != time.UTC {
				t.Errorf("ISO_TIMESTAMP: %s is not UTC", value)
			}
		},
		"SEQUENCE": func(t *testing.T, value string) {
			if value != strconv.Itoa(seq) {
				t.Errorf("SEQUENCE: got %q, want %d", value, seq)
			}
		},
	}

	for name, check := range expected {
		value, unknown := ExpandVariables("${"+name+"}", seq)
		if len(unknown) != 0 {
			t.Errorf("%s: reported unknown tokens %v", name, unknown)
		}
		check(t, value)
	}
}

func TestExpandVariablesUUIDUniqueness(t *testing.T) {
	const count = 250
	uuids := make(map[string]struct{}, count)
	guids := make(map[string]struct{}, count)

	for range count {
		uuidValue, unknown := ExpandVariables("${UUID}", 1)
		if len(unknown) != 0 {
			t.Fatalf("unexpected unknown tokens %v", unknown)
		}
		if !uuidV4Pattern.MatchString(uuidValue) {
			t.Fatalf("%q is not a v4 UUID", uuidValue)
		}
		if _, dup := uuids[uuidValue]; dup {
			t.Fatalf("duplicate UUID %q", uuidValue)
		}
		uuids[uuidValue] = struct{}{}

		guidValue, _ := ExpandVariables("${guid}", 1)
		if !uuidV4Pattern.MatchString(guidValue) {
			t.Fatalf("%q is not a v4 GUID", guidValue)
		}
		if _, dup := guids[guidValue]; dup {
			t.Fatalf("duplicate GUID %q", guidValue)
		}
		guids[guidValue] = struct{}{}
	}
}

func TestExpandVariablesSequenceAndUniquenessInOneString(t *testing.T) {
	// Each occurrence of a token expands independently.
	first, _ := ExpandVariables("${UUID}|${UUID}|${SEQUENCE}", 7)
	second, _ := ExpandVariables("${UUID}|${UUID}|${SEQUENCE}", 8)

	firstParts := strings.Split(first, "|")
	secondParts := strings.Split(second, "|")
	if len(firstParts) != 3 {
		t.Fatalf("unexpected expansion %q", first)
	}
	if firstParts[0] == firstParts[1] {
		t.Errorf("two UUIDs in one message are identical: %q", firstParts[0])
	}
	if firstParts[2] != "7" || secondParts[2] != "8" {
		t.Errorf("SEQUENCE mismatch: %q / %q", first, second)
	}
}

func TestExpandVariablesUnknownTokens(t *testing.T) {
	input := "${FOO} keep ${FOO} ${bar} ${Bar} end"
	expanded, unknown := ExpandVariables(input, 1)

	if expanded != input {
		t.Errorf("unknown tokens must stay literal, got %q", expanded)
	}
	if len(unknown) != 2 {
		t.Fatalf("unknown = %v, want 2 deduped entries", unknown)
	}
	if unknown[0] != "${FOO}" || unknown[1] != "${bar}" {
		t.Errorf("unknown = %v, want [${FOO} ${bar}] preserving first spelling", unknown)
	}
}

func TestExpandVariablesCaseInsensitiveNames(t *testing.T) {
	lower, unknown := ExpandVariables("${uuid} ${sequence} ${random_int}", 3)
	if len(unknown) != 0 {
		t.Fatalf("unexpected unknown tokens: %v", unknown)
	}
	parts := strings.Fields(lower)
	if len(parts) != 3 {
		t.Fatalf("unexpected expansion %q", lower)
	}
	if !uuidV4Pattern.MatchString(parts[0]) {
		t.Errorf("lowercase uuid not expanded: %q", parts[0])
	}
	if parts[1] != "3" {
		t.Errorf("lowercase sequence = %q, want 3", parts[1])
	}
}

func TestExpandVariablesNoTokens(t *testing.T) {
	input := `plain {"json":true} $NOT_A_TOKEN ${{x}}`
	expanded, unknown := ExpandVariables(input, 5)
	if expanded != input {
		t.Errorf("got %q, want unchanged %q", expanded, input)
	}
	if unknown != nil {
		t.Errorf("unknown = %v, want nil", unknown)
	}
}

func TestExpandVariablesMalformedTokens(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"unterminated", "a ${UUID", "a ${UUID"},
		{"empty token", "a ${} b", "a ${} b"},
		{"curly without dollar", "a {UUID} b", "a {UUID} b"},
		{"dollar only", "a $ b", "a $ b"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			expanded, unknown := ExpandVariables(tc.input, 1)
			if expanded != tc.want {
				t.Errorf("got %q, want %q", expanded, tc.want)
			}
			if len(unknown) != 0 {
				t.Errorf("unknown = %v, want none", unknown)
			}
		})
	}
}

func TestExpandVariablesConcurrent(t *testing.T) {
	var wg sync.WaitGroup
	for worker := range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for seq := 1; seq <= 100; seq++ {
				want := worker*1000 + seq
				expanded, unknown := ExpandVariables("${UUID}-${SEQUENCE}-${RANDOM_STRING}", want)
				if len(unknown) != 0 {
					t.Errorf("unexpected unknown tokens: %v", unknown)
					return
				}
				if !strings.Contains(expanded, "-"+strconv.Itoa(want)+"-") {
					t.Errorf("sequence %d missing from %q", want, expanded)
					return
				}
			}
		}()
	}
	wg.Wait()
}
