let gosuSocket = new ReconnectingWebSocket("ws://127.0.0.1:24050/ws");
let ppCalcSocket = new ReconnectingWebSocket("ws://127.0.0.1:24051");

let star = document.getElementById("star");
let chartContext = document.getElementById("ppcurvechat").getContext("2d");
let info_cont = document.getElementById("info");

document.getElementById("info").style.fontFamily = config.font;
Chart.defaults.font.family = config.font;

let animation = {
    star: new CountUp('star', 0, 0, 2, .2, {useEasing: true, useGrouping: false, separator: ",", decimal: "." }),
};

let gameState;
let currentCombo = 0;
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

class CurrPPPoint extends Chart.BubbleController {
    draw() { super.draw(arguments); }
}
CurrPPPoint.id = "currpppoint";
Chart.register(CurrPPPoint);

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
})

gosuSocket.onopen = () => { console.log("Successfully connected to gosumemory."); };
ppCalcSocket.onopen = () => { console.log("Successfully connected to pp calc server.") }

gosuSocket.onclose = () => { console.log("Socket gosumemory closed."); };
ppCalcSocket.onclose = () => { console.log("Socket pp calc server closed."); };

ppCalcSocket.onmessage = event => {
    event.data.arrayBuffer().then(buffer => {
        let view = new DataView(buffer);
        let offset = 0;

        let opCode = view.getUint8(offset);

        if (opCode === 0) {
            let result = CalcProcessor.parseCalcSessionPacket(view);
            currentCalcSessionAddr = result.sessionMemAddr;
            console.log("created calc session at " + currentCalcSessionAddr);

            ppCalcSocket.send(CalcProcessor.calculateMaxComboPPCurve(currentCalcSessionAddr));
        } else if(opCode === 1) {
            let result = CalcProcessor.parseCalcSessionPacket(view);
            console.log("released calc addr: " + result.sessionMemAddr);
        } else if (opCode === 2 || opCode === 3) {
            let result = CalcProcessor.parsePPCurvePacket(view);
            let isMaxComboCurve = opCode === 2;

            if (isMaxComboCurve) {
                currentMaxComboPPCurve = result.ppCurvePoints;
            } else {
                currentComboPPCurve = result.ppCurvePoints;
            }

            let yAxios = calculateInterval(config.curveYAxiosStartFromZero ? 0 : (isMaxComboCurve ? currentMaxComboPPCurve[0] : currentComboPPCurve[0]));
            ppCurveChart.config.options.scales.y.suggestedMin = config.curveYAxiosStartFromZero ? 0 : yAxios.minValue;
            ppCurveChart.config.options.scales.y.suggestedMax = yAxios.maxValue;
            ppCurveChart.config.options.scales.y.ticks.stepSize = yAxios.interval;

            if (isMaxComboCurve) {
                ppCurveChart.data.datasets[1].data = currentMaxComboPPCurve;
            } else {
                ppCurveChart.data.datasets[2].data = currentComboPPCurve;
                ppCurveChart.data.datasets[0].data[0] = { x: currentAccuracy, y: currentPp };
            }
            ppCurveChart.update();
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
                step: (now, fx) => info_cont.style.opacity = String(now)
            });
            currentCombo = 0;
            prevMaxCombo = 0;
            currentAccuracy = 0.0;
            currentPp = 0.0;

            ppCalcSocket.send(CalcProcessor.createCalcSession((() => {
                let path = String(config.osuSongsPath);
                path += data.menu.bm.path.folder;
                path += "\\";
                path += data.menu.bm.path.file;
                return path;
            })(), data.menu.mods.num));
        } else {
            $({n: 1}).animate({n: 0}, {
                duration: 250,
                step: (now, fx) => info_cont.style.opacity = String(now)
            });

            comboList = [];
            currentMaxComboPPCurve = null;
            currentComboPPCurve = null;
            if (currentCalcSessionAddr != null) {
                ppCalcSocket.send(CalcProcessor.releaseCalcSession(currentCalcSessionAddr));
                currentCalcSessionAddr = null;
            }
        }
    }

    if (gameState === 2 && currentCalcSessionAddr !== null) {
        ppCalcSocket.send(CalcProcessor.calculateCurrentPPCurve(currentCalcSessionAddr, comboList, data.gameplay.hits["0"]));
        //ppCalcSocket.send(CalcProcessor.createOp5Packet(currentCalcSessionAddr, data.gameplay.hitEvents));
    }

    if (data.gameplay.accuracy > 0) currentAccuracy = data.gameplay.accuracy;
    if (data.gameplay.pp.current > 0) currentPp = data.gameplay.pp.current;
    if (data.gameplay.score > 0) animation.star.update(data.menu.bm.stats.SR);

    if (currentCombo !== data.gameplay.combo.current) {
        if (data.gameplay.combo.current < currentCombo) {
            comboList.push(currentCombo);
            currentCombo = 0;
        } else {
            currentCombo = data.gameplay.combo.current;
        }
    }

}
