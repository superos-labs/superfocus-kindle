#!/bin/sh
# Name: Superfocus
# Author: Superfocus
# DontUseFBInk

SERVER=http://CHANGE-ME:8787
EVERY=900
AWAKE=10

DIR=/mnt/us/superfocus
FBINK=/mnt/us/libkh/bin/fbink

if [ ! -x "$FBINK" ]; then
  eips 2 2 "Superfocus: fbink not found at $FBINK"
  exit 1
fi
case "$SERVER" in
  *CHANGE-ME*)
    "$FBINK" -q -y 2 "Superfocus: set SERVER in superfocus.sh first"
    exit 1
    ;;
esac

mkdir -p "$DIR"

if [ -f "$DIR/pid" ] && kill -0 "$(cat "$DIR/pid")" 2>/dev/null; then
  touch "$DIR/exit"
  sleep 3
  if kill -0 "$(cat "$DIR/pid" 2>/dev/null)" 2>/dev/null; then
    kill "$(cat "$DIR/pid")"
    for p in $(cat "$DIR/frozen" 2>/dev/null); do kill -CONT "$p" 2>/dev/null; done
    rm -f "$DIR/pid" "$DIR/exit"
    lipc-set-prop com.lab126.pillow disableEnablePillow enable
    lipc-set-prop com.lab126.cmd wirelessEnable 1
    lipc-set-prop com.lab126.powerd preventScreenSaver 0
    "$FBINK" -q -f -c
    "$FBINK" -q -y 2 "Superfocus stopped"
  fi
  exit 0
fi

rm -f "$DIR/exit"
: > "$DIR/frozen"
: > "$DIR/log.txt"

setsid sh -c '
  FBINK="$1"; DIR="$2"; SERVER="$3"; EVERY="$4"; AWAKE="$5"

  say() {
    echo "$(date +%H:%M:%S) $1" >> "$DIR/log.txt"
  }
  pause() {
    t=0
    while [ "$t" -lt "$1" ] && [ ! -f "$DIR/exit" ]; do
      sleep 1
      t=$((t + 1))
    done
  }

  lipc-set-prop com.lab126.powerd preventScreenSaver 1
  sleep 5
  lipc-set-prop com.lab126.pillow disableEnablePillow disable
  for name in mesquite KPPMainApp; do
    for p in $(pidof "$name" 2>/dev/null); do
      kill -STOP "$p" 2>/dev/null && echo "$p" >> "$DIR/frozen"
    done
  done
  freeze_tree() {
    kill -STOP "$1" 2>/dev/null && echo "$1" >> "$DIR/frozen"
    for c in $(awk -v p="$1" "\$4==p{print \$1}" /proc/[0-9]*/stat 2>/dev/null); do
      freeze_tree "$c"
    done
  }
  bar=""
  [ -f /etc/upstart/statusbar.conf ] && bar=$(initctl status statusbar 2>/dev/null | sed -n "s/.*process \([0-9]*\).*/\1/p")
  [ -n "$bar" ] && freeze_tree "$bar"
  say "started, statusbar: $bar frozen: $(tr "\n" " " < "$DIR/frozen")"

  RUN=$(date +%s)
  echo "$RUN" > "$DIR/run"
  rm -f "$DIR/armed"
  cycle=0
  paints=0
  failed=0
  while [ ! -f "$DIR/exit" ]; do
    lipc-set-prop com.lab126.powerd preventScreenSaver 1
    lipc-set-prop com.lab126.cmd wirelessEnable 1
    began=$(date +%s)
    got=0
    while [ $(($(date +%s) - began)) -lt 45 ] && [ ! -f "$DIR/exit" ]; do
      if curl -s -f -m 10 -o "$DIR/screen.tmp" "$SERVER/screen.png"; then
        got=1
        break
      fi
      sleep 2
    done
    if [ "$got" = 1 ]; then
      if [ "$cycle" -eq 0 ]; then
        mv -f "$DIR/screen.tmp" "$DIR/screen.png"
        "$FBINK" -q -f -c; sleep 2
        "$FBINK" -q -f -g file="$DIR/screen.png" -W GC16
      elif [ "$failed" = 1 ]; then
        mv -f "$DIR/screen.tmp" "$DIR/screen.png"
        "$FBINK" -q -f -g file="$DIR/screen.png" -W GC16
      elif ! cmp -s "$DIR/screen.tmp" "$DIR/screen.png"; then
        mv -f "$DIR/screen.tmp" "$DIR/screen.png"
        paints=$((paints + 1))
        if [ $((paints % 4)) -eq 0 ]; then
          "$FBINK" -q -f -g file="$DIR/screen.png" -W GC16
        else
          "$FBINK" -q -g file="$DIR/screen.png" -W GC16
        fi
      fi
      failed=0
      say "cycle $cycle ok, battery $(lipc-get-prop com.lab126.powerd battLevel 2>/dev/null)%"
    else
      "$FBINK" -q -y 2 "Superfocus: no answer from $SERVER at $(date +%H:%M)"
      failed=1
      say "cycle $cycle no answer from $SERVER"
    fi
    if [ "$cycle" -eq 0 ]; then
      for dev in /dev/input/event*; do
        (
          while [ "$(cat "$DIR/run" 2>/dev/null)" = "$RUN" ]; do
            dd if="$dev" of=/dev/null bs=16 count=1 2>/dev/null || break
            [ -f "$DIR/armed" ] && echo "$dev" > "$DIR/exit"
          done
        ) &
      done
      touch "$DIR/armed"
    fi
    cycle=$((cycle + 1))

    pause "$AWAKE"
    [ -f "$DIR/exit" ] && break
    lipc-set-prop com.lab126.cmd wirelessEnable 0
    pause "$EVERY"
  done

  for p in $(cat "$DIR/frozen"); do kill -CONT "$p" 2>/dev/null; done
  lipc-set-prop com.lab126.pillow disableEnablePillow enable
  lipc-set-prop com.lab126.cmd wirelessEnable 1
  lipc-set-prop com.lab126.powerd preventScreenSaver 0
  say "stopped after $cycle cycles, by: $(cat "$DIR/exit" 2>/dev/null)"
  rm -f "$DIR/pid" "$DIR/exit" "$DIR/run" "$DIR/armed"
  "$FBINK" -q -f -c
' superfocus "$FBINK" "$DIR" "$SERVER" "$EVERY" "$AWAKE" > /dev/null 2>&1 < /dev/null &
echo $! > "$DIR/pid"
