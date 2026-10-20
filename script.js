(() => {
    "use strict";
    const $ = (id) => document.getElementById(id),
        colors = { P1: "#bfdbfe", P2: "#bbf7d0", P3: "#fde68a", P4: "#fecaca", CS: "#e9d5ff", IDLE: "#e2e8f0" };
    const presets = {
        activity1: {
            q: 2,
            o: 0,
            p: [
                ["P1", 0, 5],
                ["P2", 1, 3],
                ["P3", 2, 4],
                ["P4", 3, 2],
            ],
        },
        activity2: {
            q: 2,
            o: 1,
            p: [
                ["P1", 0, 5],
                ["P2", 1, 4],
                ["P3", 2, 3],
                ["P4", 3, 2],
            ],
        },
    };
    let result = null,
        t = 0,
        playTimer = null;
    function msg(s, bad = false) {
        $("message").textContent = s;
        $("message").style.color = bad ? "#b42318" : "";
    }
    function row(id, a, b) {
        let tr = document.createElement("tr");
        tr.innerHTML = `<td><input class="pid" aria-label="Process ID" value="${id}"></td><td><input class="at" type="number" min="0" step="1" value="${a}" aria-label="Arrival time"></td><td><input class="bt" type="number" min="1" step="1" value="${b}" aria-label="Burst time"></td><td><button type="button" class="secondary remove">Remove</button></td>`;
        tr.querySelector(".remove").onclick = () => {
            if ($("inputs").children.length === 1) return msg("At least one process is required.", true);
            tr.remove();
        };
        $("inputs").append(tr);
    }
    function loadPreset(name) {
        if (name === "custom") return;
        let x = presets[name];
        $("quantum").value = x.q;
        $("overhead").value = x.o;
        $("inputs").innerHTML = "";
        x.p.forEach((p) => row(...p));
        $("other").value = name === "activity1" ? 3 : 4;
        msg("Preset loaded. Click Run simulation.");
    }
    function read() {
        let q = +$("quantum").value,
            o = +$("overhead").value;
        if (!Number.isInteger(q) || q < 1) throw Error("Quantum must be a positive whole number.");
        if (!Number.isInteger(o) || o < 0) throw Error("Overhead must be a non-negative whole number.");
        let p = [...$("inputs").rows].map((r) => ({
            id: r.querySelector(".pid").value.trim(),
            arrival: +r.querySelector(".at").value,
            burst: +r.querySelector(".bt").value,
        }));
        if (
            !p.length ||
            p.some(
                (x) =>
                    !x.id || !Number.isInteger(x.arrival) || x.arrival < 0 || !Number.isInteger(x.burst) || x.burst < 1
            )
        )
            throw Error("Enter unique process IDs, arrival times ≥ 0 and burst times ≥ 1 (whole numbers).");
        if (new Set(p.map((x) => x.id.toLowerCase())).size !== p.length) throw Error("Process IDs must be unique.");
        if (p.length > 30) throw Error("Use 30 processes or fewer.");
        return { p, q, o };
    }
    function simulate(input, q = input.q) {
        if (!Number.isInteger(q) || q < 1) throw Error("Second quantum must be a positive whole number.");
        let ps = input.p
                .map((x) => ({ ...x, rem: x.burst, first: null, ct: null }))
                .sort((a, b) => a.arrival - b.arrival),
            by = new Map(ps.map((x) => [x.id, x])),
            ready = [],
            arrived = new Set(),
            tl = [],
            now = 0,
            run = null,
            used = 0,
            last = null,
            guard = 0;
        function admit(n) {
            ps.forEach((p) => {
                if (p.arrival === n && !arrived.has(p.id)) {
                    ready.push(p.id);
                    arrived.add(p.id);
                }
            });
        }
        while (ps.some((p) => p.ct === null)) {
            if (++guard > 100000) throw Error("Simulation safety limit reached.");
            admit(now);
            if (run === null) {
                if (!ready.length) {
                    tl.push({ time: now, id: "IDLE" });
                    now++;
                    continue;
                }
                let next = ready.shift();
                if (input.o && last !== null && last !== next) {
                    tl.push({ time: now, id: "CS", from: last, to: next });
                    let start = now;
                    now += input.o;
                    for (let n = start + 1; n <= now; n++) admit(n);
                }
                run = next;
                used = 0;
                if (by.get(run).first === null) by.get(run).first = now;
            }
            let p = by.get(run);
            tl.push({ time: now, id: run });
            p.rem--;
            used++;
            now++;
            admit(now);
            if (p.rem === 0) {
                p.ct = now;
                last = run;
                run = null;
                used = 0;
            } else if (used === q) {
                ready.push(run);
                last = run;
                run = null;
                used = 0;
            }
        }
        ps.forEach((p) => {
            p.tat = p.ct - p.arrival;
            p.wt = p.tat - p.burst;
            p.rt = p.first - p.arrival;
        });
        let switches = tl.filter((e) => e.id === "CS").length,
            total = tl.length,
            busy = tl.filter((e) => by.has(e.id)).length;
        return {
            input,
            q,
            ps,
            tl,
            switches,
            overhead: switches * input.o,
            eff: total ? (100 * busy) / total : 0,
            avgTat: ps.reduce((s, p) => s + p.tat, 0) / ps.length,
            avgWt: ps.reduce((s, p) => s + p.wt, 0) / ps.length,
            end: total,
        };
    }
    function stop() {
        if (playTimer) clearInterval(playTimer);
        playTimer = null;
        if (result) render();
    }
    function render() {
        if (!result) return;
        let { tl, ps } = result,
            end = result.end,
            active = tl.find((e) => e.time === t),
            visible = tl.filter((e) => e.time < t),
            done = ps.filter((p) => p.ct <= t);
        $("clock").textContent = t + " ms";
        $("status").textContent =
            t >= end
                ? "Finished"
                : !active
                  ? "Ready"
                  : active.id === "CS"
                    ? "Context switching"
                    : active.id === "IDLE"
                      ? "Idle"
                      : active.id + " running";
        $("what").textContent =
            t >= end
                ? "All processes completed."
                : !active
                  ? "Ready to start"
                  : active.id === "CS"
                    ? `Context switch: ${active.from} → ${active.to}`
                    : active.id === "IDLE"
                      ? "CPU is idle"
                      : `${active.id} executes during [${t}, ${t + 1}) ms`;
        $("detail").textContent =
            t >= end
                ? `Total elapsed time: ${end} ms.`
                : active?.id === "CS"
                  ? `No process executes during this ${result.input.o} ms overhead interval.`
                  : active?.id === "IDLE"
                    ? "No process is ready."
                    : "Advance one millisecond to see the next event.";
        $("cards").innerHTML = ps
            .map((p) => {
                let rem = Math.max(0, p.burst - visible.filter((e) => e.id === p.id).length),
                    state =
                        p.arrival > t
                            ? "Not arrived"
                            : rem === 0
                              ? "Completed"
                              : active?.id === p.id
                                ? "Running"
                                : "Waiting / ready";
                return `<div class="card" style="--pc:${colors[p.id] || "#ddd"}"><strong>${p.id} — ${state}</strong><p>Arrival: ${p.arrival} ms</p><p>Burst: ${p.burst} ms</p><p>Remaining: ${rem} ms</p></div>`;
            })
            .join("");
        $("gantt").innerHTML = tl
            .map(
                (e) =>
                    `<div class="block ${e.time === t ? "current" : ""}" style="--pc:${colors[e.id] || "#ddd"}"><strong>${e.id}</strong><small>${e.time}–${e.time + 1}</small></div>`
            )
            .join("");
        $("results").innerHTML = ps
            .map(
                (p) =>
                    `<tr><td>${p.id}</td><td>${p.arrival}</td><td>${p.burst}</td><td>${p.ct <= t ? p.ct : "—"}</td><td>${p.ct <= t ? p.tat : "—"}</td><td>${p.ct <= t ? p.wt : "—"}</td><td>${p.first < t ? p.rt : "—"}</td></tr>`
            )
            .join("");
        const avg = (k) => (done.length ? (done.reduce((s, p) => s + p[k], 0) / done.length).toFixed(2) + " ms" : "—"),
            sw = visible.filter((e) => e.id === "CS").length,
            busy = visible.filter((e) => ps.some((p) => p.id === e.id)).length;
        $("summary").innerHTML = [
            ["Completed", `${done.length}/${ps.length}`],
            ["Avg turnaround", avg("tat")],
            ["Avg waiting", avg("wt")],
            ["Context switches", sw],
            ["Overhead", `${sw * result.input.o} ms`],
            ["CPU efficiency", t ? ((100 * busy) / t).toFixed(2) + "%" : "—"],
        ]
            .map((x) => `<div><span>${x[0]}</span><strong>${x[1]}</strong></div>`)
            .join("");
        $("prev").disabled = t <= 0;
        $("next").disabled = t >= end;
        $("play").disabled = false;
        $("reset").disabled = false;
        $("play").textContent = playTimer ? "❚❚ Pause" : "▶ Play";
    }
    function run() {
        stop();
        try {
            let input = read();
            result = simulate(input);
            t = 0;
            $("compare-results").innerHTML = '<tr><td colspan="6">Click Compare quantum values.</td></tr>';
            $("compare-note").textContent = "";
            render();
            msg("Simulation ready. Step through the timeline or press Play.");
        } catch (e) {
            msg(e.message, true);
        }
    }
    $("preset").onchange = () => {
        loadPreset($("preset").value);
        if ($("preset").value === "custom") msg("Custom mode: edit the process table.");
    };
    $("add").onclick = () => {
        $("preset").value = "custom";
        row("P" + ($("inputs").rows.length + 1), 0, 1);
    };
    $("run").onclick = run;
    $("next").onclick = () => {
        stop();
        t = Math.min(result.end, t + 1);
        render();
    };
    $("prev").onclick = () => {
        stop();
        t = Math.max(0, t - 1);
        render();
    };
    $("reset").onclick = () => {
        stop();
        t = 0;
        render();
    };
    $("play").onclick = () => {
        if (playTimer) {
            stop();
            return;
        }
        if (!result) return;
        if (t >= result.end) t = 0;
        playTimer = setInterval(() => {
            if (t >= result.end) {
                stop();
                return;
            }
            t++;
            render();
            if (t >= result.end) stop();
        }, 650);
        render();
    };
    $("compare").onclick = () => {
        try {
            let input = read(),
                other = +$("other").value;
            if (!Number.isInteger(other) || other < 1) throw Error("Second quantum must be a positive whole number.");
            let runs = [...new Set([input.q, other])].map((q) => simulate(input, q));
            $("compare-results").innerHTML = runs
                .map(
                    (r) =>
                        `<tr><td>${r.q} ms</td><td>${r.avgTat.toFixed(2)} ms</td><td>${r.avgWt.toFixed(2)} ms</td><td>${r.switches}</td><td>${r.overhead} ms</td><td>${r.eff.toFixed(2)}%</td></tr>`
                )
                .join("");
            let best = [...runs].sort((a, b) => a.avgWt - b.avgWt)[0];
            $("compare-note").textContent =
                `Lowest average waiting time in this comparison: quantum ${best.q} ms. Consider response time and context-switch overhead too.`;
            msg("Quantum comparison generated.");
        } catch (e) {
            msg(e.message, true);
        }
    };
    loadPreset("activity1");
    run();
})();
