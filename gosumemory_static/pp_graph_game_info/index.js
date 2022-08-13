let gosuSocket = new ReconnectingWebSocket("ws://127.0.0.1:24050/ws");
let ppCalcSocket = new ReconnectingWebSocket("ws://127.0.0.1:24051");

let osuSongsPath = "C:\\Users\\<username>\\AppData\\Local\\osu!\\Songs\\"

let combo = document.getElementById("combo");
let score = document.getElementById("score");
let accuracy = document.getElementById("accuracy");
let pp = document.getElementById("pp");
let star = document.getElementById("star");
let chartContext = document.getElementById("ppcurvechat").getContext("2d");

let top_cont = document.getElementById("top");
let bottom_cont = document.getElementById("bottom");
let info_cont = document.getElementById("info");

let animation = {
    acc: new CountUp('accuracy', 0, 0, 2, .2, { useEasing: true, useGrouping: true, separator: ",", decimal: "." }),
    score: new CountUp('score', 0, 0, 0, .2, { useEasing: true, useGrouping: true, separator: ",", decimal: "." }),
    combo: new CountUp('combo', 0, 0, 0, .2, { useEasing: true, useGrouping: true, separator: ",", decimal: ".", suffix: "×" }),
    pp: new CountUp('pp', 0, 0, 0, .2, {useEasing: true, useGrouping: false, separator: ",", decimal: ".", suffix: " pp" }),
    star: new CountUp('star', 0, 0, 2, .2, {useEasing: true, useGrouping: false, separator: ",", decimal: "." }),
}

let textEncoder = new TextEncoder();
let CalcProcessor = {
    createOp1Packet(path, mods) {
        let pathArr = textEncoder.encode(path);
        let buffer = new ArrayBuffer(pathArr.length + 4 + 4 + 1);
        let view = new DataView(buffer);
        let offset = 0;

        view.setUint8(offset, 0x1); offset += 1;
        view.setUint32(offset, mods, true); offset += 4;
        view.setUint32(offset, pathArr.length, true); offset += 4;

        let u8Arr = new Uint8Array(buffer);
        u8Arr.set(pathArr, offset);

        return u8Arr;
    },
    parseOp1Packet(view) {
        let offset = 1;
        let sessionMemAddr = view.getBigInt64(offset, true); offset += 8;
        let ppCurveLen = view.getBigUint64(offset, true); offset += 8;
        let ppCurvePoints = [];
        for (let index = 0; index < ppCurveLen; index++) {
            ppCurvePoints.push(view.getFloat64(offset, true));
            offset += 8;
        }
        return { sessionMemAddr, ppCurvePoints }
    },

    createOp2Packet(sessionMemAddr, comboList, misses) {
        let buffer = new ArrayBuffer(1 + 8 + 8 + 8 + 8 * comboList.length);
        let view = new DataView(buffer);
        let offset = 0;

        view.setUint8(offset, 0x2); offset += 1;
        view.setBigUint64(offset, sessionMemAddr, true); offset += 8;
        view.setBigUint64(offset, BigInt(misses), true); offset += 8;
        view.setBigUint64(offset, BigInt(comboList.length), true); offset += 8;

        for (const i in comboList) {
            view.setBigUint64(offset, BigInt(comboList[i]), true); offset += 8;
        }

        return new Uint8Array(buffer);
    },
    parseOp2Packet(view) {
        let offset = 1;

        let ppCurveLen = view.getBigUint64(offset, true); offset += 8;
        let ppCurvePoints = [];
        for (let index = 0; index < ppCurveLen; index++) {
            ppCurvePoints.push(view.getFloat64(offset, true));
            offset += 8;
        }

        return { ppCurvePoints };
    },

    createOp4Packet(sessionMemAddr) {
        let buffer = new ArrayBuffer(1 + 8);
        let view = new DataView(buffer);
        let offset = 0;

        view.setUint8(offset, 0x4); offset += 1;
        view.setBigUint64(offset, sessionMemAddr, true); offset += 8;

        return new Uint8Array(buffer);
    },
    parseOp4Packet(view) {
        let offset = 1;

        let sessionMemAddr = view.getBigInt64(offset, true); offset += 8;

        return { sessionMemAddr };
    }
}

class CurrPPPoint extends Chart.BubbleController {
    draw() { super.draw(arguments); }
}
CurrPPPoint.id = "currpppoint";
Chart.register(CurrPPPoint);
Chart.defaults.font.family = 'JetBrains Mono';

let gameState;
let currentCombo = 0;
let prevMaxCombo = 0;
let currentAccuracy = 100.00;
let currentPp = 0.0;

let currentCalcSessionAddr = null;
let currentMaxComboPPCurve = null;
let currentComboPPCurve = null;
let comboList = [];

function calculateInterval(minValue) {
    let maxValue = currentMaxComboPPCurve[currentMaxComboPPCurve.length - 1];
    const lineRow = 5;
    let interval = (() => {
        let rawInterval = (maxValue - minValue) / lineRow;
        return Math.round(rawInterval + (10 - rawInterval % 10));
    })();
    let startValue = Math.round(minValue - minValue % interval);

    return { minValue, maxValue, interval, startValue };
}

const ppCurveChart = new Chart(chartContext, {
    type: 'currpppoint',
    data: {
        labels: ['90', '91', '92', '93', '94', '95', '96', '97', '98', '99', '100'],
        datasets: [{
            label: "curr",
            data: [],
            pointRadius: 5,
            borderColor: "rgb(179, 255, 102)",
            backgroundColor: "rgb(179, 255, 102)",

        }, {
            label: 'if fc curve',
            data: [],
            borderWidth: 4,
            borderColor: "rgb(255, 204, 34)",
            fill: false,
            pointRadius: 0,
            cubicInterpolationMode: 'monotone',
            type: 'line',
        }, {
            label: 'curr curve',
            data: [],
            borderWidth: 4,
            borderColor: "white",
            fill: false,
            pointRadius: 0,
            cubicInterpolationMode: 'monotone',
            type: 'line',
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scaleFontColor: "rgb(255,255,255)",
        interaction: {
            mode: 'nearest',
            axis: 'x',
            intersect: false
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: {
                    stepSize: 1,
                    color: "white",
                    size: "12px",
                }
            },
            y: {
                grid: { display: true },
                ticks: {
                    color: "white",
                    size: "15px",
                }
            }
        },
        plugins: {
            legend: {
                display: false,
                position: 'bottom'
            }
        }
    }
});

gosuSocket.onopen = () => { console.log("Successfully connected to gosumemory."); };
ppCalcSocket.onopen = () => { console.log("Successfully connected to pp calc server.") }

gosuSocket.onclose = () => { console.log("Socket gosumemory closed."); };
ppCalcSocket.onclose = () => { console.log("Socket pp calc server closed."); };

ppCalcSocket.onmessage = event => {
    event.data.arrayBuffer().then(buffer => {
        let view = new DataView(buffer);
        let offset = 0;

        let opCode = view.getUint8(offset);

        if (opCode === 1) {
            let result = CalcProcessor.parseOp1Packet(view);
            currentCalcSessionAddr = result.sessionMemAddr;
            currentMaxComboPPCurve = result.ppCurvePoints;
            console.log("created calc session at " + currentCalcSessionAddr);

            let yAxios = calculateInterval(currentMaxComboPPCurve[0]);
            ppCurveChart.config.options.scales.y.suggestedMin = yAxios.minValue;
            ppCurveChart.config.options.scales.y.suggestedMax = yAxios.maxValue;
            ppCurveChart.config.options.scales.y.ticks.stepSize = yAxios.interval;

            ppCurveChart.data.datasets[1].data = currentMaxComboPPCurve;
            console.log(ppCurveChart.data.datasets[1])
            console.log("init chart");
            ppCurveChart.update();
        } if(opCode === 2) {
            let result = CalcProcessor.parseOp2Packet(view);
            currentComboPPCurve = result.ppCurvePoints;

            let yAxios = calculateInterval(currentComboPPCurve[0]);
            ppCurveChart.config.options.scales.y.suggestedMin = yAxios.minValue;
            ppCurveChart.config.options.scales.y.suggestedMax = yAxios.maxValue;
            ppCurveChart.config.options.scales.y.ticks.stepSize = yAxios.interval;

            ppCurveChart.data.datasets[2].data = currentComboPPCurve;
            ppCurveChart.data.datasets[0].data[0] = { x: currentAccuracy, y: currentPp };
            ppCurveChart.update();
        } if(opCode === 4) {
            let result = CalcProcessor.parseOp4Packet(view);
            console.log("released calc addr: " + result.sessionMemAddr);
        }
    });
}

gosuSocket.onmessage = event => {
    let data = JSON.parse(event.data);
    if (gameState !== data.menu.state) {
        gameState = data.menu.state;
        if (gameState === 2) {
            // Gameplay
            $({n: 0}).animate({n: 1}, {
                duration: 250,
                step: (now, fx) => {
                    top_cont.style.opacity = String(now);
                    bottom_cont.style.opacity = String(now);
                    info_cont.style.opacity = String(now);
                }
            });
            currentCombo = 0;
            prevMaxCombo = 0;
            currentAccuracy = 0.0;
            currentPp = 0.0;

            ppCalcSocket.send(CalcProcessor.createOp1Packet((() => {
                let path = String(osuSongsPath);
                path += data.menu.bm.path.folder;
                path += "\\";
                path += data.menu.bm.path.file;
                return path;
            })(), data.menu.mods.num));
        } else {
            $({n: 1}).animate({n: 0}, {
                duration: 250,
                step: (now, fx) => {
                    top_cont.style.opacity = String(now);
                    bottom_cont.style.opacity = String(now);
                    info_cont.style.opacity = String(now);
                }
            });

            comboList = [];
            currentMaxComboPPCurve = null;
            currentComboPPCurve = null;
            if (currentCalcSessionAddr != null) {
                ppCalcSocket.send(CalcProcessor.createOp4Packet(currentCalcSessionAddr));
                currentCalcSessionAddr = null;
            }
        }
    }

    if (gameState === 2 && currentCalcSessionAddr !== null) {
        if (currentCalcSessionAddr != null) {
            ppCalcSocket.send(CalcProcessor.createOp2Packet(currentCalcSessionAddr, comboList, data.gameplay.hits["0"]));
        }
    }

    if (data.gameplay.score > 0) {
        animation.score.update(data.gameplay.score);
        animation.star.update(data.menu.bm.stats.SR);
    }

    if (data.gameplay.accuracy > 0) {
        animation.acc.update(data.gameplay.accuracy);
        if (data.gameplay.accuracy > currentAccuracy) {
            accuracy.style.color = "rgb(179, 255, 102)";
        } else if (data.gameplay.accuracy < currentAccuracy) {
            accuracy.style.color = "rgb(255, 98, 98)";
        }
        currentAccuracy = data.gameplay.accuracy;
    } else {
        animation.acc.update(0);
    }

    if (data.gameplay.pp.current > 0) {
        animation.pp.update(data.gameplay.pp.current);
        if (data.gameplay.pp.current > currentPp) {
            pp.style.color = "rgb(179, 255, 102)";
        } else if (data.gameplay.pp.current < currentPp) {
            pp.style.color = "rgb(255, 98, 98)";
        }
        currentPp = data.gameplay.pp.current;
    } else {
        animation.pp.update(0);
    }

    if (currentCombo !== data.gameplay.combo.current) {
        if (data.gameplay.combo.current < currentCombo) {
            comboList.push(currentCombo);
            if(currentCombo > prevMaxCombo) prevMaxCombo = currentCombo;
            currentCombo = 0;
            combo.animate([
                { color: "rgb(255, 50, 50)" },
                { color: "rgb(255, 255, 255)" },
                { color: "rgb(255, 255, 255)" }
            ], {
                duration: 1000, easing: "ease-out"
            });
            animation.combo.update(0);
        } else {
            currentCombo = data.gameplay.combo.current;
            animation.combo.update(currentCombo);
            if(currentCombo > prevMaxCombo) {
                combo.style.color = "rgb(179, 255, 102)";
            } else {
                combo.style.color = "rgb(255, 255, 255)";
            }
            $({n: 66}).animate({n: 60}, {
                duration: 80,
                step: (now, fx) => {
                    combo.style.fontSize = now + "px";
                }
            });
        }
    }

}
