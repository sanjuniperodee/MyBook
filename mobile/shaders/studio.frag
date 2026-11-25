#version 460 core
// Студия 3D-книги — как сцена three.js сайта (components/book3d/webgl/BookScene.ts): купол с градиентом
// зенит → горизонт → низ, «стол» с пятном света к краям темнее, линейный туман к горизонту, пятно контакта под книгой и
// мягкая тень от ключевого света. Каждый пиксель — луч из камеры; все числа приходят из API v1 bookModel.scene.
#include <flutter/runtime_effect.glsl>

uniform vec2 uSize;
uniform vec3 uEye;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform float uFocal;
uniform float uGroundY;
uniform float uFloorR;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uNadir;
uniform vec3 uFloorCenter;
uniform vec3 uFloorEdge;
uniform float uLitNoKey;
uniform float uKeyTerm;
uniform vec3 uKeyDir;
uniform vec2 uContactSize;
uniform float uContactOpacity;
uniform vec4 uContact;
uniform float uFade;
uniform float uSoft;
uniform float uBoxCount;
uniform vec4 uBox0a; // центр xyz, поворот вокруг y
uniform vec3 uBox0b; // половины размеров
uniform vec4 uBox1a;
uniform vec3 uBox1b;

out vec4 fragColor;

// Khronos PBR Neutral — та же кривая, что NeutralToneMapping у three.js.
vec3 neutral(vec3 c) {
  float x = min(c.r, min(c.g, c.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c -= offset;
  float peak = max(c.r, max(c.g, c.b));
  const float start = 0.76;
  if (peak < start) return c;
  const float d = 0.24;
  float newPeak = 1.0 - d * d / (peak + d - start);
  c *= newPeak / peak;
  float g = 1.0 - 1.0 / (0.15 * (peak - newPeak) + 1.0);
  return mix(c, vec3(newPeak), g);
}

vec3 dome(vec3 d) {
  // Купол сайта: вертикальный градиент по углу — зенит (верх), горизонт (середина), низ.
  float v = 0.5 - asin(clamp(d.y, -1.0, 1.0)) / 3.14159265;
  return v < 0.5 ? mix(uZenith, uHorizon, v / 0.5) : mix(uHorizon, uNadir, (v - 0.5) / 0.5);
}

// Луч от точки к свету пересекает ли коробку (повёрнутую вокруг вертикали)?
float hitBox(vec3 o, vec3 d, vec4 a, vec3 h) {
  float c = cos(-a.w);
  float s = sin(-a.w);
  vec3 lo = o - a.xyz;
  lo = vec3(c * lo.x + s * lo.z, lo.y, -s * lo.x + c * lo.z);
  vec3 ld = vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);
  vec3 inv = 1.0 / (ld + vec3(1e-6));
  vec3 t0 = (-h - lo) * inv;
  vec3 t1 = (h - lo) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  float tn = max(max(tmin.x, tmin.y), tmin.z);
  float tf = min(min(tmax.x, tmax.y), tmax.z);
  return (tf > max(tn, 0.0)) ? 1.0 : 0.0;
}

float occluded(vec3 p) {
  float hit = 0.0;
  if (uBoxCount > 0.5) hit = max(hit, hitBox(p, uKeyDir, uBox0a, uBox0b));
  if (uBoxCount > 1.5) hit = max(hit, hitBox(p, uKeyDir, uBox1a, uBox1b));
  return hit;
}

void main() {
  vec2 frag = FlutterFragCoord().xy;
  vec2 c = frag - uSize * 0.5;
  vec3 d = normalize(uFwd * uFocal + uRight * c.x - uUp * c.y);
  vec3 sky = dome(d);
  vec3 col = sky;
  if (d.y < -1e-4 && uFade > 0.001) {
    float t = (uGroundY - uEye.y) / d.y;
    vec3 p = uEye + d * t;
    float r = length(p.xz) / uFloorR;
    if (t > 0.0 && r < 1.0) {
      // «Стол»: пятно света в центре (до 18% радиуса), к краю темнее.
      vec3 floorCol = mix(uFloorCenter, uFloorEdge, clamp((r - 0.18) / 0.82, 0.0, 1.0));
      // Мягкая тень от ключевого света: несколько лучей вокруг точки.
      // Мягкая тень (PCF с радиусом, как shadow.radius сайта): 5×5 лучей вокруг точки.
      float vis = 0.0;
      for (int i = -2; i <= 2; i++) {
        for (int j = -2; j <= 2; j++) {
          vis += occluded(p + vec3(float(i), 0.0, float(j)) * uSoft);
        }
      }
      vis = 1.0 - vis / 25.0;
      // Свет на столе — как у книги: всё, кроме ключевого, и ключевой с тенью; затем тоновая кривая.
      vec3 lin = pow(floorCol, vec3(2.2)) * (uLitNoKey + uKeyTerm * vis);
      floorCol = pow(clamp(neutral(lin), 0.0, 1.0), vec3(1.0 / 2.2));
      // Пятно контакта: радиальная текстура 128 px (от 4 до 64 px), растянутая на W·1.15 × (D·5 + 22).
      vec2 q = vec2(p.x / uContactSize.x, p.z / uContactSize.y) * 128.0;
      float k = clamp((length(q) - 4.0) / 60.0, 0.0, 1.0);
      float a = k < 0.5 ? mix(uContact.a, uContact.a * 0.389, k / 0.5) : mix(uContact.a * 0.389, 0.0, (k - 0.5) / 0.5);
      floorCol = mix(floorCol, uContact.rgb, a * uContactOpacity);
      // Туман растворяет стол в горизонте.
      float fog = clamp((t - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
      floorCol = mix(floorCol, uHorizon, fog);
      col = mix(sky, floorCol, uFade);
    }
  }
  fragColor = vec4(col, 1.0);
}
