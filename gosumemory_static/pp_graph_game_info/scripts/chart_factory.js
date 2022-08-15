class CurrPPPoint extends Chart.BubbleController {
    draw() { super.draw(arguments); }
}
CurrPPPoint.id = "currpppoint";
Chart.register(CurrPPPoint);

this.createPPCurveChat = (context) => {
    return new Chart(context, {
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
};
