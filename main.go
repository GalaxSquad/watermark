package main

import (
	"embed"

	"watermark-01/internal/annotations"
	"watermark-01/internal/config"
	"watermark-01/internal/kafka"
	"watermark-01/internal/lagalert"
	"watermark-01/internal/schema"
	"watermark-01/internal/templates"
	"watermark-01/internal/updater"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// version is injected at build time via: -ldflags "-X main.version=vX.Y.Z"
var version = "dev"

//go:embed all:frontend/dist
var assets embed.FS

func init() {
	application.RegisterEvent[kafka.Message]("liveTail:message")
	application.RegisterEvent[string]("liveTail:error")
	application.RegisterEvent[lagalert.LagAlertPayload]("lag:alert")
	application.RegisterEvent[updater.UpdateStatus]("update:progress")
	application.RegisterEvent[updater.UpdateInfo]("update:available")
}

func main() {
	// Initialize config service (loads key + config from ~/.watermark/)
	configSvc, err := config.NewConfigService()
	if err != nil {
		println("Config error:", err.Error())
		return
	}

	kafkaSvc := kafka.NewKafkaService(configSvc)
	schemaSvc := schema.NewSchemaService(configSvc)

	annotationSvc, err := annotations.NewAnnotationService(configSvc.GetConfigDir())
	if err != nil {
		println("Annotations error:", err.Error())
		return
	}

	updaterSvc := updater.NewUpdaterService(version, configSvc)
	lagAlertSvc := lagalert.NewLagAlertService(kafkaSvc, configSvc.GetConfigDir())

	templateSvc, err := templates.NewTemplateService(configSvc.GetConfigDir())
	if err != nil {
		println("Templates error:", err.Error())
		return
	}

	lifecycleApp := NewApp(configSvc, kafkaSvc, schemaSvc, annotationSvc, updaterSvc, lagAlertSvc, templateSvc)

	app := application.New(application.Options{
		Name:        "Watermark",
		Description: "Kafka Desktop Client",
		Services: []application.Service{
			application.NewService(lifecycleApp),
			application.NewService(configSvc),
			application.NewService(kafkaSvc),
			application.NewService(schemaSvc),
			application.NewService(annotationSvc),
			application.NewService(updaterSvc),
			application.NewService(lagAlertSvc),
			application.NewService(templateSvc),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "Watermark",
		Width:            1280,
		Height:           800,
		BackgroundColour: application.NewRGBA(10, 10, 15, 255),
		URL:              "/",
	})

	if err := app.Run(); err != nil {
		println("Error:", err.Error())
	}
}
