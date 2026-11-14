#!/bin/bash
# ============================================================================
# PhyllHost Terminal Script & Bot Template Installer
# Usage:
#   Interactive menu : bash install.sh
#   Direct selection : bash install.sh 1   (or bash install.sh 01-whatsapp-bot)
#   One-liner from GitHub:
#     bash <(curl -fsSL https://raw.githubusercontent.com/${GITHUB_REPO:-phyllhost/phyllhost-scripts}/main/install.sh)
# ============================================================================
set -e

REPO_SLUG="${GITHUB_REPO:-phyllhost/phyllhost-scripts}"
BRANCH="${GITHUB_BRANCH:-main}"
WORK_DIR="${INSTALL_BASE_DIR:-$(pwd)}"

BOLD="\033[1m"
GREEN="\033[1;32m"
CYAN="\033[1;36m"
YELLOW="\033[1;33m"
RED="\033[1;31m"
RESET="\033[0m"

TEMPLATES=(
  "01-whatsapp-bot|WhatsApp Bot (Baileys)|QR + pairing code, self-DM commands, AI, stickers, downloader, group tools"
  "02-discord-mod-bot|Discord Moderation Bot|Slash + !prefix commands, tickets, XP/levels, auto-mod, mod-log"
  "03-telegram-notify-bot|Telegram Notify Bot|Subscriptions, inline menu, daily digest & HTTP /alert webhook"
  "04-paystack-webhook|Paystack Webhook Server|HMAC-SHA512 verification, idempotency, JSON logs & retry queue"
  "05-price-tracker|Product Price Tracker|Multi-target price & stock monitor with webhook notifications"
  "06-scheduler|Cron Job Scheduler|Log, webhook & shell cron jobs with retries, history & status API"
)

banner() {
  echo -e "${CYAN}╭──────────────────────────────────────────────────────────────╮${RESET}"
  echo -e "${CYAN}│${RESET}        ${BOLD}🚀 PhyllHost Terminal Script & Bot Installer${RESET}          ${CYAN}│${RESET}"
  echo -e "${CYAN}╰──────────────────────────────────────────────────────────────╯${RESET}"
}

ensure_repo_source() {
  # If install.sh is run from inside a cloned repo, use local files directly.
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || pwd)"
  if [ -d "$SCRIPT_DIR/01-whatsapp-bot" ] && [ -d "$SCRIPT_DIR/02-discord-mod-bot" ]; then
    SRC_ROOT="$SCRIPT_DIR"
    return 0
  fi

  # Otherwise download/clone from GitHub into a temporary cache folder
  SRC_ROOT="/tmp/phyllhost-templates-cache"
  rm -rf "$SRC_ROOT"
  echo -e "${YELLOW}⬇ Fetching templates from GitHub (${REPO_SLUG})...${RESET}"
  if command -v git >/dev/null 2>&1; then
    git clone --depth 1 -b "$BRANCH" "https://github.com/${REPO_SLUG}.git" "$SRC_ROOT" >/dev/null 2>&1 || {
      echo -e "${RED}Could not clone https://github.com/${REPO_SLUG}.git — check GITHUB_REPO or internet connection.${RESET}"
      exit 1
    }
  else
    mkdir -p "$SRC_ROOT"
    curl -fsSL "https://codeload.github.com/${REPO_SLUG}/tar.gz/refs/heads/${BRANCH}" | tar -xz -C "$SRC_ROOT" --strip-components=1
  fi
}

configure_env_var() {
  local env_file="$1"
  local key="$2"
  local prompt_text="$3"
  local required="$4"
  local val=""

  while true; do
    read -r -p "  • ${prompt_text}: " val </dev/tty || true
    if [ -n "$val" ]; then
      # Escape sed special chars
      local esc_val
      esc_val=$(printf '%s\n' "$val" | sed -e 's/[\/&]/\\&/g')
      if grep -q "^${key}=" "$env_file" 2>/dev/null; then
        sed -i "s/^${key}=.*/${key}=${esc_val}/" "$env_file"
      else
        echo "${key}=${val}" >> "$env_file"
      fi
      break
    elif [ "$required" != "true" ]; then
      break
    else
      echo -e "    ${YELLOW}(Required — or press Ctrl+C to edit .env manually later)${RESET}"
    fi
  done
}

prompt_env_for_template() {
  local slug="$1"
  local dest="$2"
  local env_file="$dest/.env"

  if [ ! -f "$env_file" ] && [ -f "$dest/.env.example" ]; then
    cp "$dest/.env.example" "$env_file"
  fi
  [ ! -f "$env_file" ] && return 0

  echo ""
  read -r -p "Would you like to configure .env settings now? [Y/n]: " cfg_ans </dev/tty || cfg_ans="n"
  if [[ "$cfg_ans" =~ ^[Nn] ]]; then
    echo -e "  ${YELLOW}Skipped — edit ${env_file} before starting.${RESET}"
    return 0
  fi

  case "$slug" in
    01-whatsapp-bot)
      configure_env_var "$env_file" "OWNER_NUMBER" "Your WhatsApp Number (e.g. 233509032295)" "true"
      configure_env_var "$env_file" "BOT_NAME" "Bot Name (Enter for MyBot)" "false"
      configure_env_var "$env_file" "PAIRING_CODE" "Use 8-digit pairing code instead of QR? (true/false, Enter for false)" "false"
      configure_env_var "$env_file" "PAIRING_NUMBER" "Bot Phone Number if using pairing code (Enter to skip)" "false"
      configure_env_var "$env_file" "GROQ_API_KEY" "Groq API Key for .ai (Enter to skip)" "false"
      configure_env_var "$env_file" "GEMINI_API_KEY" "Gemini API Key for .ai (Enter to skip)" "false"
      ;;
    02-discord-mod-bot)
      configure_env_var "$env_file" "DISCORD_TOKEN" "Discord Bot Token" "true"
      configure_env_var "$env_file" "CLIENT_ID" "Discord Application Client ID" "true"
      configure_env_var "$env_file" "GUILD_ID" "Discord Server ID for instant slash commands (Enter to skip)" "false"
      ;;
    03-telegram-notify-bot)
      configure_env_var "$env_file" "TELEGRAM_BOT_TOKEN" "Telegram Bot Token (@BotFather)" "true"
      configure_env_var "$env_file" "OWNER_CHAT_ID" "Your Telegram Chat ID (@userinfobot)" "true"
      configure_env_var "$env_file" "PORT" "HTTP Webhook Port (Enter for 3000)" "false"
      ;;
    04-paystack-webhook)
      configure_env_var "$env_file" "PAYSTACK_SECRET_KEY" "Paystack Secret Key (sk_test_... / sk_live_...)" "true"
      configure_env_var "$env_file" "PORT" "Server Port (Enter for 3000)" "false"
      ;;
    05-price-tracker)
      configure_env_var "$env_file" "WEBHOOK_URL" "Alert Webhook URL (Enter for console-only)" "false"
      ;;
    06-scheduler)
      configure_env_var "$env_file" "TZ" "Timezone (Enter for Africa/Accra)" "false"
      configure_env_var "$env_file" "WEBHOOK_URL" "Default Webhook URL (Enter to skip)" "false"
      configure_env_var "$env_file" "STATUS_PORT" "Status Server Port (Enter for 3000)" "false"
      ;;
  esac
  echo -e "  ${GREEN}✓ Saved configuration to ${env_file}${RESET}"
}

install_single_template() {
  local slug="$1"
  ensure_repo_source

  if [ ! -d "$SRC_ROOT/$slug" ]; then
    echo -e "${RED}Template '$slug' not found.${RESET}"
    exit 1
  fi

  local dest="$WORK_DIR/$slug"
  echo -e "\n${CYAN}➜ Installing ${BOLD}${slug}${RESET}${CYAN} into ${dest}...${RESET}"
  mkdir -p "$dest"
  cp -r "$SRC_ROOT/$slug/." "$dest/"
  if [ -f "$dest/.env.example" ] && [ ! -f "$dest/.env" ]; then
    cp "$dest/.env.example" "$dest/.env"
  fi

  echo -e "${YELLOW}📦 Installing npm dependencies...${RESET}"
  (cd "$dest" && npm install --omit=dev --no-audit --no-fund)

  prompt_env_for_template "$slug" "$dest"

  echo -e "\n${GREEN}========================================================${RESET}"
  echo -e "${GREEN}✅ ${slug} is installed and ready!${RESET}"
  echo -e "   Folder : ${BOLD}${dest}${RESET}"
  echo -e "   Start  : ${BOLD}cd ${dest} && node index.js${RESET}"
  echo -e "${GREEN}========================================================${RESET}"

  read -r -p "Start ${slug} now? [y/N]: " run_ans </dev/tty || run_ans="n"
  if [[ "$run_ans" =~ ^[Yy] ]]; then
    cd "$dest"
    exec node index.js
  fi
}

install_all_templates() {
  ensure_repo_source
  echo -e "\n${CYAN}➜ Copying all 6 templates + ecosystem.config.js into ${WORK_DIR}...${RESET}"
  for entry in "${TEMPLATES[@]}"; do
    slug="${entry%%|*}"
    mkdir -p "$WORK_DIR/$slug"
    cp -r "$SRC_ROOT/$slug/." "$WORK_DIR/$slug/"
    if [ -f "$WORK_DIR/$slug/.env.example" ] && [ ! -f "$WORK_DIR/$slug/.env" ]; then
      cp "$WORK_DIR/$slug/.env.example" "$WORK_DIR/$slug/.env"
    fi
    echo -e "${YELLOW}📦 Installing dependencies for ${slug}...${RESET}"
    (cd "$WORK_DIR/$slug" && npm install --omit=dev --no-audit --no-fund)
  done
  [ -f "$SRC_ROOT/ecosystem.config.js" ] && cp "$SRC_ROOT/ecosystem.config.js" "$WORK_DIR/"
  echo -e "\n${GREEN}✅ All 6 templates installed in ${WORK_DIR}!${RESET}"
  echo -e "Configure each folder's .env file, then run with: ${BOLD}pm2 start ecosystem.config.js${RESET}"
}

resolve_choice() {
  local choice="$1"
  case "$choice" in
    1|01|01-whatsapp-bot|whatsapp|whatsapp-bot) install_single_template "01-whatsapp-bot" ;;
    2|02|02-discord-mod-bot|discord|discord-mod) install_single_template "02-discord-mod-bot" ;;
    3|03|03-telegram-notify-bot|telegram|telegram-notify) install_single_template "03-telegram-notify-bot" ;;
    4|04|04-paystack-webhook|paystack|paystack-webhook) install_single_template "04-paystack-webhook" ;;
    5|05|05-price-tracker|price|price-tracker) install_single_template "05-price-tracker" ;;
    6|06|06-scheduler|scheduler|cron) install_single_template "06-scheduler" ;;
    7|all) install_all_templates ;;
    0|q|quit|exit) echo "Exited."; exit 0 ;;
    *) echo -e "${RED}Invalid selection: $choice${RESET}"; exit 1 ;;
  esac
}

# Non-interactive argument support (e.g. `bash install.sh 1`)
if [ -n "${1:-}" ]; then
  resolve_choice "$1"
  exit 0
fi

banner
echo ""
i=1
for entry in "${TEMPLATES[@]}"; do
  IFS='|' read -r slug title desc <<< "$entry"
  printf "  ${GREEN}%d)${RESET} ${BOLD}%-28s${RESET} — %s\n" "$i" "$title" "$desc"
  printf "     ${CYAN}Folder: %s${RESET}\n" "$slug"
  i=$((i + 1))
done
echo -e "  ${GREEN}7)${RESET} ${BOLD}Install ALL 6 Templates${RESET}     — Full bundle + PM2 ecosystem.config.js"
echo -e "  ${GREEN}0)${RESET} Exit"
echo ""
read -r -p "Select a template to install [0-7]: " USER_CHOICE </dev/tty || exit 0
resolve_choice "$USER_CHOICE"
