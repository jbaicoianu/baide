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
        let state = 'STATION_ID';
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
            runwayVisualRanges: [],
            weatherPhenomena: [],
            pressureTrend: null,
            seaLevelPressureHpa: null,
            precipitationHourIn: null,
            precipitation3HrIn: null,
            precipitation6HrIn: null,
            precipitation24HrIn: null,
            maxTemp6HrC: null,
            minTemp6HrC: null,
            pressureTendencyHpaPer3Hr: null,
            sensorStatusIndicators: [],
            remarks: ''
        };

        for (let i = 0; i < tokens.length; i++) {
            let token = tokens[i];
            console.log(' -', token, state);
            switch (state) {
                case 'START':
                    // METAR or SPECI
                    if (/^(METAR|SPECI)$/.test(token)) {
                        state = 'STATION_ID';
                    }
                    break;
                case 'STATION_ID':
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
                        state = 'REPORT_MODIFIER';
                    }
                    break;
                case 'REPORT_MODIFIER':
                    // Report Modifier (e.g., AUTO, COR)
                    if (/^(AUTO|COR)$/.test(token)) {
                        metarData.reportModifier = token;
                        state = 'WIND';
                    } else {
                        state = 'WIND';
                        i--; // Re-evaluate this token in the WIND state
                    }
                    break;
                case 'WIND':
                    // Wind
                    if (/^\d{3}\d{2,3}(G\d{2,3})?KT$/.test(token)) {
                        const windRegex = /^(\d{3})(\d{2,3})(G(\d{2,3}))?KT$/;
                        const windMatch = token.match(windRegex);
                        metarData.windDirDegrees = windMatch[1] !== '000' ? parseInt(windMatch[1], 10) : null;
                        metarData.windSpeedKts = parseInt(windMatch[2], 10);
                        metarData.windGustKts = windMatch[4] ? parseInt(windMatch[4], 10) : null;
                        state = 'WIND_VARIATION_OR_VISIBILITY';
                    } else {
                        state = 'WIND_VARIATION_OR_VISIBILITY';
                        i--; // Re-evaluate this token in the new state
                    }
                    break;
                case 'WIND_VARIATION_OR_VISIBILITY':
                    // Wind Variation or Visibility
                    if (/^\d{3}V\d{3}$/.test(token) || /^VRB\d{2,3}$/.test(token)) {
                        metarData.windVariation = token;
                        continue;
                    }
                    // Fall through to Visibility
                case 'VISIBILITY':
                    // Visibility
                    if (/^[\d\/]+SM$/.test(token)) {
                        metarData.visibilityStatuteMi = this.parseVisibility(token);
                        metarData.visibilityMeters = metarData.visibilityStatuteMi * 1609.34;
                        state = 'RUNWAY_VISUAL_RANGE_OR_WEATHER';
                    } else {
                        state = 'RUNWAY_VISUAL_RANGE_OR_WEATHER';
                        i--; // Re-evaluate this token in the new state
                    }
                    break;
                case 'RUNWAY_VISUAL_RANGE_OR_WEATHER':
                    // Runway Visual Range or Weather Phenomena
                    if (/^R\d{2}[LRC]?\/[PM]?\d{4}FT$/.test(token)) {
                        metarData.runwayVisualRanges.push(this.parseRunwayVisualRange(token));
                    } else if (/^R\d{2}V\d{2}$/.test(token)) {
                        metarData.runwayVisualRanges.push(this.parseVariableRunwayVisualRange(token));
                    } else if (/^[+-]?(DZ|RA|SN|GR|SG|TS|BR|FG|FU|HZ|VA|DU|SA|SQ|FC|SS|DS|PO|VC|PY|FZ)$/.test(token)) {
                        metarData.weatherPhenomena.push(this.parseWeatherPhenomena(token));
                    } else {
                        state = 'SKY_CONDITIONS';
                        i--; // Re-evaluate this token in the new state
                    }
                    break;
                case 'SKY_CONDITIONS':
                    // Multiple Sky Conditions
                    if (/^(FEW|SCT|BKN|OVC)(\d{3})(VC)?$/.test(token)) {
                        const skyRegex = /^(FEW|SCT|BKN|OVC)(\d{3})(VC)?$/;
                        const skyMatch = token.match(skyRegex);
                        metarData.skyConditions.push({
                            skyCover: skyMatch[1],
                            cloudBaseFtAgl: parseInt(skyMatch[2], 10) * 100,
                            vicinity: skyMatch[3] ? true : false
                        });
                        continue;
                    } else {
                        state = 'TEMPERATURE';
                        i--; // Re-evaluate this token in the new state
                    }
                    break;
                case 'TEMPERATURE':
                    // Temperature and Dew Point
                    if (/^M?\d{2}\/M?\d{2}$/.test(token)) {
                        const tempDew = token.split('/');
                        console.log('ehhhh', tempDew, token);
                        metarData.temperatureC = tempDew[0].startsWith('M') ? -parseInt(tempDew[0].slice(1), 10) : parseInt(tempDew[0], 10);
                        metarData.dewPointC = tempDew[1].startsWith('M') ? -parseInt(tempDew[1].slice(1), 10) : parseInt(tempDew[1], 10);
                        state = 'ALTIMETER';
                    } else {
                        state = 'ALTIMETER';
                        i--; // Re-evaluate this token in the new state
                    }
                    break;
                case 'ALTIMETER':
                    // Altimeter
                    if (/^A\d{4}$/.test(token)) {
                        metarData.altimeterInHg = parseInt(token.slice(1), 10) / 100;
                        state = 'PRECIPITATION';
                    } else {
                        state = 'PRECIPITATION';
                        i--; // Re-evaluate this token in the new state
                    }
                    break;
                case 'PRECIPITATION':
                    // Hourly Precipitation Amount (Prrrr)
                    if (/^P\d{4}$/.test(token)) {
                        metarData.precipitationHourIn = parseFloat(token.slice(1)) / 100;
                        state = 'PRECIPITATION_3HR';
                    } else {
                        state = 'PRECIPITATION_3HR';
                        i--;
                    }
                    break;
                case 'PRECIPITATION_3HR':
                    // 3-Hour Precipitation Amount (6RRRR)
                    if (/^\d{5}$/.test(token)) {
                        metarData.precipitation3HrIn = parseFloat(token.slice(1)) / 100;
                        state = 'PRECIPITATION_6HR';
                    } else {
                        state = 'PRECIPITATION_6HR';
                        i--;
                    }
                    break;
                case 'PRECIPITATION_6HR':
                    // 6-Hour Precipitation Amount
                    if (/^\d{5}$/.test(token)) {
                        metarData.precipitation6HrIn = parseFloat(token) / 100;
                        state = 'PRECIPITATION_24HR';
                    } else {
                        state = 'PRECIPITATION_24HR';
                        i--;
                    }
                    break;
                case 'PRECIPITATION_24HR':
                    // 24-Hour Precipitation Amount
                    if (/^7\d{4}$/.test(token)) {
                        metarData.precipitation24HrIn = parseFloat(token.slice(1)) / 100;
                        state = 'TEMPERATURE_EXTREMA';
                    } else {
                        state = 'TEMPERATURE_EXTREMA';
                        i--;
                    }
                    break;
                case 'TEMPERATURE_EXTREMA':
                    // 6-Hour Max/Min Temperature, 24-Hour Max/Min
                    if (/^\d{5}$/.test(token)) {
                        // Example: 10066
                        metarData.maxTemp6HrC = parseInt(token.slice(1, 3), 10);
                        state = 'MIN_TEMP_6HR';
                    } else if (/^\d{6}$/.test(token)) {
                        // Example: 21012
                        metarData.minTemp6HrC = parseInt(token.slice(2, 4), 10);
                        state = 'PRESSURE_TENDENCY';
                    } else {
                        state = 'PRESSURE_TENDENCY';
                        i--;
                    }
                    break;
                case 'MIN_TEMP_6HR':
                    // Minimum Temperature for 6 Hours
                    if (/^\d{5}$/.test(token)) {
                        metarData.minTemp6HrC = parseInt(token.slice(1, 3), 10);
                        state = 'PRESSURE_TENDENCY';
                    } else {
                        state = 'PRESSURE_TENDENCY';
                        i--;
                    }
                    break;
                case 'PRESSURE_TENDENCY':
                    // Pressure Tendency (5appp)
                    if (/^[5]\w{4}$/.test(token)) {
                        metarData.pressureTendencyHpaPer3Hr = this.parsePressureTendency(token);
                        state = 'SEA_LEVEL_PRESSURE';
                    } else {
                        state = 'SEA_LEVEL_PRESSURE';
                        i--;
                    }
                    break;
                case 'SEA_LEVEL_PRESSURE':
                    // Sea Level Pressure
                    if (/^SLP\d{3}$/.test(token)) {
                        metarData.seaLevelPressureHpa = parseInt(token.slice(3), 10) / 10;
                        state = 'PRESSURE_TREND_OR_SENSOR';
                    } else {
                        state = 'PRESSURE_TREND_OR_SENSOR';
                        i--;
                    }
                    break;
                case 'PRESSURE_TREND_OR_SENSOR':
                    // Pressure Trend or Sensor Status Indicators
                    if (/^TSNO$/.test(token)) {
                        metarData.sensorStatusIndicators.push(token);
                    } else {
                        // Handle other possible sensor indicators
                        // ...
                    }
                    state = 'REMARKS';
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

    parseVisibility(token) {
        // Converts visibility from string like "1SM" or "3/4SM" to float in miles
        let visibilityStr = token.replace('SM', '');
        let isLessThan = false;

        if (visibilityStr.startsWith('M')) {
            isLessThan = true;
            visibilityStr = visibilityStr.slice(1);
        }

        let visibility = 0;
        if (visibilityStr.includes('/')) {
            const [numerator, denominator] = visibilityStr.split('/').map(Number);
            if (denominator !== 0) {
                visibility = numerator / denominator;
            } else {
                console.error('Invalid visibility fraction:', token);
                visibility = null;
            }
        } else {
            visibility = parseFloat(visibilityStr);
        }

        if (isLessThan) {
            // Indicate visibility is less than the parsed value
            return -visibility;
        }

        return visibility;
    },

    parseRunwayVisualRange(token) {
        // Example: R11/P6000FT
        const regex = /^R(\d{2})([PV]?)(\d{4})FT$/;
        const match = token.match(regex);
        if (match) {
            return {
                runway: match[1],
                prefix: match[2],
                rangeFt: parseInt(match[3], 10)
            };
        }
        return null;
    },

    parseVariableRunwayVisualRange(token) {
        // Example: R11V17
        const regex = /^R(\d{2})V(\d{2})$/;
        const match = token.match(regex);
        if (match) {
            return {
                runway: match[1],
                variableRange: {
                    fromFt: parseInt(match[2], 10) * 100
                }
            };
        }
        return null;
    },

    parseWeatherPhenomena(token) {
        // Example: -RA, BR, TSNO
        const regex = /^([+-]?)(DZ|RA|SN|GR|SG|TS|BR|FG|FU|HZ|VA|DU|SA|SQ|FC|SS|DS|PO|VC|PY|FZ)$/;
        const match = token.match(regex);
        if (match) {
            return {
                intensity: match[1] || 'MOD',
                phenomena: match[2]
            };
        }
        return null;
    },

    parsePressureTendency(token) {
        // Example: 58033
        const regex = /^5([A-Z])(\d{3})$/;
        const match = token.match(regex);
        if (match) {
            return {
                trend: match[1], // e.g., 'p' for rising
                pressureChangeHpa: parseInt(match[2], 10) / 10
            };
        }
        return null;
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
            SCT: '0.275 0.510 0.706',    // Steel Blue
            BKN: '1 0 0',                // Red
            OVC: '0.411 0.411 0.411'     // Dim Gray
        };
        console.log('go');
        let largestScale = 100;
        weather.skyConditions.forEach((condition, index) => {
            console.log(condition);
            const color = skyCoverColors[condition.skyCover] || '1 1 1'; // Default to white
            let altitude = condition.cloudBaseFtAgl * 0.3048;
            const scale = altitude;
            largestScale = Math.max(largestScale, scale);

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
                if (condition.skyCover == 'FEW') coverage = 0.4;
                else if (condition.skyCover == 'SCT') coverage = 0.5;
                else if (condition.skyCover == 'BKN') coverage = 0.6;
                else if (condition.skyCover == 'OVC') coverage = 1.0;

                let winddir = weather.windDirDegrees * Math.PI / 180;
                let windspeed = weather.windSpeedKts * 0.514444; // meters per second
                let adjustedWindspeed = windspeed / 100;

                let wind = V(Math.sin(winddir), 0, Math.cos(winddir)).multiplyScalar(adjustedWindspeed);

                skySphere.shader.uniforms.coverage.value = coverage;
                skySphere.shader.uniforms.wind.value = wind;
                skySphere.traverseObjects(n => { if (n.material) n.renderOrder = 100 - index; });

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
            fog: false,
            scale: V(largestScale * 1.25),
        }));
        room.far_dist = largestScale * 1.5;
        room.fog = true;
        room.fog_mode = 'linear';
        room.fog_end = weather.visibilityMeters / 100;
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