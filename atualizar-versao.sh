#!/bin/sh
# Antes de publicar: grava uma versão nova no site e no painel (páginas abertas se recarregam sozinhas)
V=$(date +%Y%m%d%H%M)
echo "$V" > versao.txt
sed -i "s/const VERSAO = \"[0-9]*\"/const VERSAO = \"$V\"/" index.html admin/index.html admin-preview/index.html
echo "versão $V"
