room.registerElement('weather-metar', {
    metarData: {},
    gps: '',
    stationid: '',
    skySpheres: [],

    async getWeatherByGPS(lat, lon) {
        try {
            const station = await this.findClosestStation(lat, lon);
            if (!station) {
                throw new Error('No weather station found nearby.');
            }
            const metar = await this.fetchMetar(station.id);
            this.metarData = this.parseMetar(metar);
            return this.metarData;
        } catch (error) {
            console.error('Error fetching METAR data:', error);
            return null;
        }
    },

    async getWeatherByStationId(stationId) {
        try {
            const metar = await this.fetchMetar(stationId);
            if (!metar) {
                throw new Error('No METAR data found for the specified station.');
            }
            this.metarData = this.parseMetar(metar);
            return this.metarData;
        } catch (error) {
            console.error('Error fetching METAR data:', error);
            return null;
        }
    },

    async findClosestStation(lat, lon) {
        const response = await fetch(`https://p.janusxr.org/https://aviationweather.gov/data/stations?lat=${lat}&lon=${lon}&radius=50&mostRecent=true`);
        if (!response.ok) {
            console.error('Failed to fetch stations data:', response.statusText);
            return null;
        }
        const data = await response.json();
        if (!data.stations || data.stations.length === 0) return null;
        const station = data.stations[0];
        return {
            id: station.stationId,
            name: station.name,
            latitude: parseFloat(station.latitude),
            longitude: parseFloat(station.longitude)
        };
    },

    async fetchMetar(stationId) {
        const response = await fetch(`https://p.janusxr.org/https://aviationweather.gov/api/data/metar?ids=${stationId}&format=raw&taf=false`);
        if (!response.ok) {
            console.error('Failed to fetch METAR data:', response.statusText);
            return null;
        }
        const metar = await response.text();
        return metar;
    },

    parseMetar(metar) {
        if (!metar) return null;

        const tokens = metar.trim().split(/\s+/);
        let state = 'START';
        let metarData = {
            stationId: null,
            observationTime: null,
            windDirDegrees: null,
            windSpeedKts: null,
            windGustKts: null,
            visibilityStatuteMi: null,
            skyConditions: [],
            temperatureC: null,
            dewPointC: null,
            altimeterInHg: null,
            remarks: ''
        };

        for (let token of tokens) {
            console.log(' -', token, state);
            switch (state) {
                case 'START':
                    // Station ID
                    if (/^[A-Z]{4}$/.test(token)) {
                        metarData.stationId = token;
                        state = 'OBS_TIME';
                    }
                    break;
                case 'OBS_TIME':
                    // Observation Time
                    if (/^\d{6}Z$/.test(token)) {
                        metarData.observationTime = this.parseObservationTime(token);
                        state = 'WIND';
                    }
                    break;
                case 'WIND':
                    // Wind
                    if (/^\d{3}\d{2,3}(G\d{2})?KT$/.test(token)) {
                        const windRegex = /^(\d{3})(\d{2,3})(G(\d{2}))?KT$/;
                        const windMatch = token.match(windRegex);
                        metarData.windDirDegrees = windMatch[1] !== '000' ? parseInt(windMatch[1], 10) : null;
                        metarData.windSpeedKts = parseInt(windMatch[2], 10);
                        metarData.windGustKts = windMatch[4] ? parseInt(windMatch[4], 10) : null;
                        state = 'VISIBILITY';
                    }
                    break;
                case 'VISIBILITY':
                    // Visibility
                    if (/^\d+SM$/.test(token)) {
                        metarData.visibilityStatuteMi = parseFloat(token.replace('SM', ''));
                        state = 'SKY_CONDITIONS';
                    }
                    break;
                case 'SKY_CONDITIONS':
                    // Multiple Sky Conditions
                    if (/^(FEW|SCT|BKN|OVC)\d{3}$/.test(token)) {
                        const skyRegex = /^(FEW|SCT|BKN|OVC)(\d{3})$/;
                        const skyMatch = token.match(skyRegex);
                        metarData.skyConditions.push({
                            skyCover: skyMatch[1],
                            cloudBaseFtAgl: parseInt(skyMatch[2], 10) * 100
                        });
                        continue;
                    } else {
                        state = 'TEMPERATURE';
                        // Fall through to handle temperature without sky conditions
                        // No break
                        // Continue to next case
                    }
                case 'TEMPERATURE':
                    // Temperature and Dew Point
                    if (/^M?\d{2}\/M?\d{2}$/.test(token)) {
                        const tempDew = token.split('/');
                        console.log('ehhhh', tempDew, token);
                        metarData.temperatureC = tempDew[0].startsWith('M') ? -parseInt(tempDew[0].slice(1), 10) : parseInt(tempDew[0], 10);
                        metarData.dewPointC = tempDew[1].startsWith('M') ? -parseInt(tempDew[1].slice(1), 10) : parseInt(tempDew[1], 10);
                        state = 'ALTIMETER';
                    }
                    break;
                case 'ALTIMETER':
                    // Altimeter
                    if (/^A\d{4}$/.test(token)) {
                        metarData.altimeterInHg = parseInt(token.slice(1), 10) / 100;
                        state = 'REMARKS';
                    }
                    break;
                case 'REMARKS':
                    // Remarks
                    if (token === 'RMK') {
                        metarData.remarks = metar.substring(metar.indexOf('RMK'));
                        state = 'END';
                    }
                    break;
                case 'END':
                    // Do nothing
                    break;
                default:
                    break;
            }
        }

        return metarData;
    },

    parseObservationTime(observationTime) {
        // Example input: "220530Z"
        const day = parseInt(observationTime.slice(0, 2), 10);
        const hour = parseInt(observationTime.slice(2, 4), 10);
        const minute = parseInt(observationTime.slice(4, 6), 10);
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = now.getUTCMonth();
        return new Date(Date.UTC(year, month, day, hour, minute));
    },

    create() {
        this.skySpheres = [];
        if (this.stationid) {
            this.getWeatherByStationId(this.stationid).then(weather => {
                if (weather) {
                    this.updateRoomWeather(weather);
                }
            });
        } else if (this.gps) {
            const [latStr, lonStr] = this.gps.split(' ');
            const lat = parseFloat(latStr);
            const lon = parseFloat(lonStr);
            if (!isNaN(lat) && !isNaN(lon)) {
                this.getWeatherByGPS(lat, lon).then(weather => {
                    if (weather) {
                        this.updateRoomWeather(weather);
                    }
                });
            } else {
                console.error('Invalid GPS format. Expected "<lat> <lon>".');
            }
        }
        // Initialization code if needed
    },

    updateRoomWeather(weather) {
        // Implementation for updating the room with the weather data
        console.log('Room weather updated:', weather);
        // Add your update logic here

        // Remove existing sky spheres if any
        this.removeSkySpheres();

        // Define color mapping for skyCover values
        const skyCoverColors = {
            FEW: '0.529 0.808 0.922',    // Light Sky Blue
            SCT: '0.275 0.510 0.706',     // Steel Blue
            BKN: '1 0 0',      // Red
            OVC: '0.411 0.411 0.411'     // Dim Gray
        };
        console.log('go');
        largestScale = 100;
        weather.skyConditions.forEach((condition, index) => {
            console.log(condition);
            const color = skyCoverColors[condition.skyCover] || '1 1 1'; // Default to white
            const scale = .3048 * condition.cloudBaseFtAgl / 10;
            largestScale = scale;

            const skySphere = room.createObject('object', {
                id: `sphere`,
                shader_id: 'clouds',
                image_id: 'skynoise',
                cull_face: 'front',
                pos: '0 0 0',
                scale: `${scale} ${scale} ${scale}`,
                col: color,
                transparent: true,
                depth_write: false,
            });

            setTimeout(() => {
              let coverage = 0;
              if (condition.skyCover == 'FEW') coverage = 0.3;
              else if (condition.skyCover == 'SCT') coverage = .4;
              else if (condition.skyCover == 'BRN') coverage = .6;
              else if (condition.skyCover == 'OVC') coverage = 1.0;

              let winddir = weather.windDirDegrees * Math.PI / 180;
              let wind = V(Math.sin(winddir), 0, Math.cos(winddir)).multiplyScalar(weather.windSpeedKts);
                
              skySphere.shader.uniforms.coverage.value = coverage;
              skySphere.shader.uniforms.wind.value = wind;
            }, 500);
            //room.appendChild(skySphere);
            console.log(skySphere);
            this.skySpheres.push(skySphere);
        });
        // final sky sphere for overall color
        this.skySpheres.push(room.createObject('object', {
            id: 'sphere',
            col: '#87ceeb',
            cull_face: 'front',
            scale: V(largestScale * 1.25),
            
        }));
    },

    removeSkySpheres() {
        this.skySpheres.forEach(sphere => {
            room.removeChild(sphere);
        });
        this.skySpheres = [];
    },

    update(dt) {
        // Per-frame update logic if needed
    }
});