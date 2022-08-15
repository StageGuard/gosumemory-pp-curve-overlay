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

const ppCurveChart = createPPCurveChat(chartContext);

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

            let yAxios = calculateInterval(config.curveYAxiosStartFromZero ? 0 : currentMaxComboPPCurve[0]);
            ppCurveChart.config.options.scales.y.suggestedMin = config.curveYAxiosStartFromZero ? 0 : yAxios.minValue;
            ppCurveChart.config.options.scales.y.suggestedMax = yAxios.maxValue;
            ppCurveChart.config.options.scales.y.ticks.stepSize = yAxios.interval;

            ppCurveChart.data.datasets[1].data = currentMaxComboPPCurve;
            console.log(ppCurveChart.data.datasets[1])
            console.log("init chart");
            ppCurveChart.update();
        } if(opCode === 2) {
            let result = CalcProcessor.parseOp2Packet(view);
            currentComboPPCurve = result.ppCurvePoints;

            let yAxios = calculateInterval(config.curveYAxiosStartFromZero ? 0 : currentComboPPCurve[0]);
            ppCurveChart.config.options.scales.y.suggestedMin = config.curveYAxiosStartFromZero ? 0 : yAxios.minValue;
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
                step: (now, fx) => info_cont.style.opacity = String(now)
            });
            currentCombo = 0;
            prevMaxCombo = 0;
            currentAccuracy = 0.0;
            currentPp = 0.0;

            ppCalcSocket.send(CalcProcessor.createOp1Packet((() => {
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
                ppCalcSocket.send(CalcProcessor.createOp4Packet(currentCalcSessionAddr));
                currentCalcSessionAddr = null;
            }
        }
    }

    if (gameState === 2 && currentCalcSessionAddr !== null) {
        ppCalcSocket.send(CalcProcessor.createOp2Packet(currentCalcSessionAddr, comboList, data.gameplay.hits["0"]));
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
