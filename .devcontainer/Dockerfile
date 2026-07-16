FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

USER vscode

RUN curl -fsSL https://bun.com/install | bash
ENV BUN_INSTALL=/home/vscode/.bun
ENV PATH=${BUN_INSTALL}/bin:${PATH}

# Node.js for oxc and vitest extensions.
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.5/install.sh | bash \
    && bash -c "source $HOME/.nvm/nvm.sh && nvm install 24"

RUN bun install -g @openai/codex
