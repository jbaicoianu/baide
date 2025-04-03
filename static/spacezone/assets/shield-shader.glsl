// static/spacezone/assets/shield-shader.glsl

uniform vec3 color;
uniform float time;
uniform vec2 hitUV;
uniform float hitTrigger;

varying vec2 vUv;

// Simple noise function
float noise(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
}

void main() {
    // Idle effect: gently swirling clouds
    float idle = 0.5 + 0.5 * sin((vUv.x + time * 0.1) * 10.0) * sin((vUv.y + time * 0.1) * 10.0);
    
    // Hit effect: lightning bolt
    float dist = distance(vUv, hitUV);
    float lightning = 0.0;
    
    if(hitTrigger > 0.5) {
        float angle = atan(vUv.y - hitUV.y, vUv.x - hitUV.x);
        float angleDiff = abs(mod(angle, 3.14159 / 4.0) - 0.0);
        lightning = smoothstep(0.01, 0.0, angleDiff) * exp(-dist * 20.0) * sin(dist * 40.0 - time * 5.0);
    }
    
    // Combine effects
    vec3 shieldColor = color * idle + vec3(lightning);
    
    // Adjust transparency
    float alpha = 0.3 + 0.2 * idle;
    
    gl_FragColor = vec4(shieldColor, alpha);
}