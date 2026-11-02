# Despliegue en EasyPanel

| Servicio                       | Origen                         | Rama                       | Puerto |
| ------------------------------ | ------------------------------ | -------------------------- | ------ |
| `konnecttia-site` (staging)    | `infra/docker/site.Dockerfile` | `develop` o la rama del PR | 3000   |
| `konnecttia-site` (producción) | `infra/docker/site.Dockerfile` | `main`                     | 3000   |

Configuración en EasyPanel: _Build_ = Dockerfile, _Build Path_ = `/`, _File_ =
`infra/docker/site.Dockerfile`. En Traefik, el protocolo de destino es HTTP.

Variables (solo en EasyPanel, nunca en el repositorio): ver `apps/site/.env.example`.
