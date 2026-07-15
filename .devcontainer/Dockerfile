FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

USER vscode
RUN curl -fsSL https://bun.com/install | bash
# for oxc.
RUN ln -s /home/vscode/.bun/bin/bun /home/vscode/.bun/bin/node
