#!/bin/zsh
cd "$(dirname "$0")" || exit 1
PARTY_NODE="$(command -v node)"
if [[ ! -x "$PARTY_NODE" ]]; then
  echo 'Установите Node.js 24 и выполните быстрый запуск из README.md.'
  read -r '?Нажмите Enter для закрытия…'
  exit 1
fi
if [[ ! -f .env || ! -f dist/server/index.js || ! -d node_modules ]]; then
  echo 'Сначала выполните настройку и сборку по README.md.'
  read -r '?Нажмите Enter для закрытия…'
  exit 1
fi
echo 'Party Quiz — панель ведущего: http://localhost:3000/admin'
echo 'Не закрывайте это окно во время игры. Для остановки нажмите Ctrl+C.'
export NODE_ENV=production
"$PARTY_NODE" dist/server/index.js
if [[ $? -ne 0 ]]; then
  echo 'Если порт уже занят, приложение, возможно, запущено. Откройте http://localhost:3000/admin'
  read -r '?Нажмите Enter для закрытия…'
fi
