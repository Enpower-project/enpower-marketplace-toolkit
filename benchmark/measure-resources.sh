#!/usr/bin/env bash
#
# Container CPU and memory footprint for the ENPOWER Marketplace Toolkit.
#
# Samples `docker stats` at a fixed interval and reports mean and peak usage per
# container. Run it twice to get the two figures Section 3.6 needs: once with the
# stack idle, and once while a workload is running against it.
#
# Usage:
#   ./measure-resources.sh                    # 60 samples at 1 s, idle
#   DURATION=300 INTERVAL=5 ./measure-resources.sh
#   LABEL=under-load ./measure-resources.sh
#
# Output: a Markdown table on stdout, plus resources-<label>.csv.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DURATION="${DURATION:-60}"     # total sampling time in seconds
INTERVAL="${INTERVAL:-1}"      # seconds between samples
LABEL="${LABEL:-idle}"
OUT="${OUT:-benchmark/resources-$LABEL.csv}"

mkdir -p "$(dirname "$OUT")"
echo "sample,container,cpu_percent,mem_mib" > "$OUT"

samples=$((DURATION / INTERVAL))
[ "$samples" -lt 1 ] && samples=1

echo "Sampling $samples times at ${INTERVAL}s intervals (label: $LABEL)..." >&2

for i in $(seq 1 "$samples"); do
  # MemUsage looks like "123.4MiB / 7.654GiB"; take the used side and normalise.
  docker stats --no-stream \
    --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' 2>/dev/null \
  | awk -F'\t' -v s="$i" '
      {
        cpu = $2; sub(/%/, "", cpu);
        split($3, parts, " / ");
        used = parts[1];
        unit = used; gsub(/[0-9.]/, "", unit);
        val  = used; gsub(/[^0-9.]/, "", val);
        if (unit == "GiB")      mib = val * 1024;
        else if (unit == "KiB") mib = val / 1024;
        else if (unit == "B")   mib = val / 1048576;
        else                    mib = val;        # MiB
        printf "%s,%s,%.2f,%.2f\n", s, $1, cpu, mib;
      }' >> "$OUT"
  [ "$i" -lt "$samples" ] && sleep "$INTERVAL"
done

echo >&2

echo
echo "### Container resource usage — $LABEL"
echo
echo "| Container | CPU mean | CPU peak | Memory mean | Memory peak |"
echo "|---|---:|---:|---:|---:|"

awk -F',' 'NR > 1 {
    n[$2]++;
    cpu_sum[$2] += $3; if ($3 > cpu_max[$2]) cpu_max[$2] = $3;
    mem_sum[$2] += $4; if ($4 > mem_max[$2]) mem_max[$2] = $4;
    total_mem_sum += $4;
  }
  END {
    for (c in n)
      printf "| %s | %.1f %% | %.1f %% | %.0f MiB | %.0f MiB |\n",
             c, cpu_sum[c]/n[c], cpu_max[c], mem_sum[c]/n[c], mem_max[c];
  }' "$OUT" | sort

awk -F',' 'NR > 1 { n[$1] += $4 } END {
    for (s in n) { sum += n[s]; k++; if (n[s] > peak) peak = n[s] }
    if (k) printf "| **All containers** | | | **%.0f MiB** | **%.0f MiB** |\n", sum/k, peak;
  }' "$OUT"

echo
echo "Samples: $samples at ${INTERVAL}s. Raw data in $OUT."
