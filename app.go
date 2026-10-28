package main

import (
	"context"

	"watermark-01/internal/annotations"
	"watermark-01/internal/config"
	"watermark-01/internal/kafka"
	"watermark-01/internal/lagalert"
	"watermark-01/internal/schema"
	"watermark-01/internal/templates"
	"watermark-01/internal/updater"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// App struct holds references to all services and the Wails runtime context.
type App struct {
	ctx           context.Context
	configSvc     *config.ConfigService
	kafkaSvc      *kafka.KafkaService
	schemaSvc     *schema.SchemaService
	annotationSvc *annotations.AnnotationService
	updaterSvc    *updater.UpdaterService
	lagAlertSvc   *lagalert.LagAlertService
	templateSvc   *templates.TemplateService
}

// NewApp creates a new App application struct with all services.
func NewApp(c *config.ConfigService, k *kafka.KafkaService, s *schema.SchemaService, a *annotations.AnnotationService, u *updater.UpdaterService, l *lagalert.LagAlertService, t *templates.TemplateService) *App {
	return &App{configSvc: c, kafkaSvc: k, schemaSvc: s, annotationSvc: a, updaterSvc: u, lagAlertSvc: l, templateSvc: t}
}

// ServiceStartup is called when the Wails v3 app starts. Passes context to services.
func (a *App) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
	a.ctx = ctx
	a.kafkaSvc.SetContext(ctx)
	a.schemaSvc.SetContext(ctx)
	a.annotationSvc.SetContext(ctx)
	a.updaterSvc.SetContext(ctx)
	a.lagAlertSvc.SetContext(ctx)
	a.templateSvc.SetContext(ctx)

	// Auto-connect to last active cluster (non-blocking)
	if id := a.configSvc.GetActiveClusterID(); id != "" {
		go func() {
			if err := a.kafkaSvc.Connect(id); err == nil {
				a.schemaSvc.Configure(id)
				// Start lag monitoring if config exists for this cluster (opt-in)
				a.lagAlertSvc.Start(id)
			}
		}()
	}

	// Start periodic update checks in the background
	go a.updaterSvc.StartPeriodicCheck()
	return nil
}

// ServiceShutdown is called when the Wails v3 app is closing. Cleans up connections.
func (a *App) ServiceShutdown() error {
	a.lagAlertSvc.Stop()
	_ = a.kafkaSvc.DisconnectAll()
	return nil
}
