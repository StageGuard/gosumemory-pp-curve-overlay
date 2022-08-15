let gosuSocket = new ReconnectingWebSocket("ws://127.0.0.1:24050/ws");

let combo = document.getElementById("combo");
let score = document.getElementById("score");
let accuracy = document.getElementById("accuracy");
let pp = document.getElementById("pp");

let top_cont = document.getElementById("top");
let bottom_cont = document.getElementById("bottom");

document.getElementById("main").style.fontFamily = config.font;

let animation = {
    acc: new CountUp('accuracy', 0, 0, 2, .2, { useEasing: true, useGrouping: true, separator: ",", decimal: "." }),
    score: new CountUp('score', 0, 0, 0, .2, { useEasing: true, useGrouping: true, separator: ",", decimal: "." }),
    combo: new CountUp('combo', 0, 0, 0, .2, { useEasing: true, useGrouping: true, separator: ",", decimal: ".", suffix: "×" }),
    pp: new CountUp('pp', 0, 0, 0, .2, {useEasing: true, useGrouping: false, separator: ",", decimal: ".", suffix: " pp" }),
    star: new CountUp('star', 0, 0, 2, .2, {useEasing: true, useGrouping: false, separator: ",", decimal: "." }),
}

let gameState;
let currentCombo = 0;
let prevMaxCombo = 0;
let currentAccuracy = 100.00;
let currentPp = 0.0;

gosuSocket.onopen = () => { console.log("Successfully connected to gosumemory."); };

gosuSocket.onclose = () => { console.log("Socket gosumemory closed."); };

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
                }
            });
        } else {
            $({n: 1}).animate({n: 0}, {
                duration: 250,
                step: (now, fx) => {
                    top_cont.style.opacity = String(now);
                    bottom_cont.style.opacity = String(now);
                }
            });
        }
    }

    if (data.gameplay.score > 0) {
        animation.score.update(data.gameplay.score);
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
