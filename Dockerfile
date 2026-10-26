# Unser Zuhause – Agenten als Home-Assistant-Add-on. Gebaut von .github/workflows/addon.yml (amd64, aarch64).
# Autor: SebastianInTheWild · MIT-Lizenz
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends tzdata ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g @anthropic-ai/claude-code \
 && npm cache clean --force

# Version aus unser_zuhause_agents/config.yaml (setzt der Workflow), angezeigt in Weboberfläche und Protokoll
ARG VERSION=dev
# Mitgelieferte Agenten und Zeitplan: start.sh kopiert sie beim Start nach /config, sofern dort noch nicht vorhanden
ENV DEFAULTS_DIR=/defaults \
    DISABLE_AUTOUPDATER=1 \
    ADDON_VERSION=$VERSION

WORKDIR /app
COPY app/ /app/
COPY agents/ /defaults/agents/
COPY zeitplan.conf /defaults/zeitplan.conf
COPY gibt-es-nicht/ /gegenprobe/

LABEL io.hass.type="addon" \
      io.hass.name="Unser Zuhause – Agenten" \
      org.opencontainers.image.source="https://github.com/SebastianInTheWild/ha-unser-zuhause-agents"

CMD ["sh", "/app/start.sh"]
