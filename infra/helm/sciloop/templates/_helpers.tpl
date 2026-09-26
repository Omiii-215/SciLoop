{{/*
SciLoop Helm Chart — Template Helpers
*/}}

{{/*
Expand the name of the chart.
*/}}
{{- define "sciloop.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "sciloop.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "sciloop.labels" -}}
helm.sh/chart: {{ include "sciloop.name" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: sciloop
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "sciloop.selectorLabels" -}}
app.kubernetes.io/name: {{ include "sciloop.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Pod security context
*/}}
{{- define "sciloop.podSecurityContext" -}}
runAsNonRoot: {{ .Values.security.podSecurityContext.runAsNonRoot }}
runAsUser: {{ .Values.security.podSecurityContext.runAsUser }}
runAsGroup: {{ .Values.security.podSecurityContext.runAsGroup }}
fsGroup: {{ .Values.security.podSecurityContext.fsGroup }}
{{- end }}
