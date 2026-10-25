#!/bin/sh
# Download the open datasets the build reads into raw/tech-food-energy/ (ignored by git).
set -e
D="$(dirname "$0")/../../raw/tech-food-energy"; mkdir -p "$D"
curl -sL -o "$D/subst.csv" "https://ourworldindata.org/grapher/global-energy-substitution.csv?v=1&csvType=full&useColumnShortNames=true"
curl -sL -o "$D/wheat.csv" "https://ourworldindata.org/grapher/wheat-yields.csv?v=1&csvType=full&useColumnShortNames=true"
curl -sL -o "$D/chat.xls" "https://www.nber.org/hccta/hcctad.xls"
