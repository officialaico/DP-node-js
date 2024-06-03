// app.js
let musicData = [];
let currentCamera = {}; // Variable to store the current camera settings

fetch('/data')
    .then(response => response.json())
    .then(data => {
        musicData = data.data;
        updatePlot();
    })
    .catch(error => console.error('Error loading the JSON data:', error));

function updatePlot() {
    const xAxis = document.getElementById('x-axis').value;
    const yAxis = document.getElementById('y-axis').value;
    const zAxis = document.getElementById('z-axis').value;
    const colorAxis = document.getElementById('color').value;

    const highlightDistrokid = document.getElementById('highlight-distrokid').checked;
    const hideNonDistrokid = document.getElementById('hide-non-distrokid').checked;

    // Create a map to aggregate hover text for identical points
    const hoverTextMap = new Map();

    musicData.forEach(d => {
        const key = `${d[xAxis]}-${d[yAxis]}-${d[zAxis]}`;
        const text = `${d.title} by ${d.author}`;
        if (hoverTextMap.has(key)) {
            hoverTextMap.get(key).push(text);
        } else {
            hoverTextMap.set(key, [text]);
        }
    });

    // Extract aggregated hover text
    const xValues = [];
    const yValues = [];
    const zValues = [];
    const colorValues = [];
    const markerSizes = [];
    const markerColors = [];
    const markerOpacities = [];
    const hoverTexts = [];

    musicData.forEach(d => {
        if (hideNonDistrokid && !d.distrokid) {
            return;
        }

        const key = `${d[xAxis]}-${d[yAxis]}-${d[zAxis]}`;
        if (!hoverTextMap.has(key)) return;

        xValues.push(d[xAxis]);
        yValues.push(d[yAxis]);
        zValues.push(d[zAxis]);
        colorValues.push(d[colorAxis]);

        const distrokid = d.distrokid;
        markerSizes.push(distrokid && highlightDistrokid ? 16 : 12);
        markerColors.push(d[colorAxis]);
        markerOpacities.push(distrokid || !highlightDistrokid ? 0.8 : 0.2);

        // Join hover texts with newline
        hoverTexts.push(hoverTextMap.get(key).join('<br>'));
        hoverTextMap.delete(key); // Remove the key to avoid duplicates
    });

    const trace = {
        x: xValues,
        y: yValues,
        z: zValues,
        mode: 'markers',
        marker: {
            size: markerSizes,
            color: markerColors,
            colorscale: 'Viridis',
            colorbar: {
                title: colorAxis.charAt(0).toUpperCase() + colorAxis.slice(1)
            },
            opacity: markerOpacities
        },
        type: 'scatter3d',
        text: hoverTexts,
        hoverinfo: 'text'
    };

    const layout = {
        title: '3D Scatter Plot of Music Features',
        scene: {
            xaxis: {title: xAxis.charAt(0).toUpperCase() + xAxis.slice(1)},
            yaxis: {title: yAxis.charAt(0).toUpperCase() + yAxis.slice(1)},
            zaxis: {title: zAxis.charAt(0).toUpperCase() + zAxis.slice(1)}
        }
    };

    // Apply the current camera position if it exists
    if (Object.keys(currentCamera).length !== 0) {
        layout.scene.camera = currentCamera;
    }

    Plotly.newPlot('chart', [trace], layout);

    // Add an event listener to capture the camera position when it changes
    const chart = document.getElementById('chart');
    chart.on('plotly_relayout', function(eventData) {
        if (eventData['scene.camera']) {
            currentCamera = eventData['scene.camera'];
        }
    });
}
