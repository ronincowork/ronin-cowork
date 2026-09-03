#!/usr/bin/env bash

ronin_tool_source=${BASH_SOURCE[1]}
while [ -L "$ronin_tool_source" ]; do
  ronin_tool_link=$(readlink "$ronin_tool_source")
  case $ronin_tool_link in
    /*) ronin_tool_source=$ronin_tool_link ;;
    *) ronin_tool_source=$(dirname "$ronin_tool_source")/$ronin_tool_link ;;
  esac
done
SELF=$ronin_tool_source
unset ronin_tool_source ronin_tool_link
