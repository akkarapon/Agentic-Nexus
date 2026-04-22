FROM alpine:3.22

RUN apk add --no-cache nodejs npm bash && \
    npm install -g openclaw && \
    mkdir -p /root/.openclaw/workspace && \
    mkdir -p /root/.km && \
    mkdir -p /root/.openclaw/workspace/skills

# Copy default configs & workspace seed files
COPY openclaw.json.tpl  /root/.openclaw/openclaw.json
COPY TOOLS.md.tpl       /root/.openclaw/TOOLS.md.tpl
COPY SKILL.md.tpl       /root/.openclaw/SKILL.md.tpl
COPY KM.md.tpl          /root/.openclaw/KM.md.tpl
COPY WORKFLOW.md.tpl      /root/.openclaw/WORKFLOW.md.tpl
COPY COMMUNICATION.md.tpl /root/.openclaw/COMMUNICATION.md.tpl
COPY SOUL.md.tpl          /root/.openclaw/SOUL.md.tpl
COPY IDENTITY.md.tpl    /root/.openclaw/IDENTITY.md.tpl
COPY USER.md            /root/.openclaw/USER.md
COPY HEARTBEAT.md       /root/.openclaw/HEARTBEAT.md

# ---- Expose ports ----
# 22   = SSH
# 18789 = OpenClaw gateway UI
# 18790 = OpenClaw bridge
EXPOSE 22 18789 18790

CMD ["bash"]
