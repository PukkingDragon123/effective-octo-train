# Body basis for the runtime MakeHuman-lite character system.
#
# Every entry becomes one T-posed MakeHuman body (positions + joints) in public/assets/characters/mh/.
# The game blends these at runtime: a cast member uses its own body (weight 1), background people
# (randomPerson) blend two or three bodies of the same sex and age band, plus face-detail targets.
#
#   sex 'm'|'f', age (years), h: wanted standing height (m; the height macro is solved for it),
#   build: MakeHuman muscle / weight (0..1, 0.5 = average), prop: proportions macro (0.5 average),
#   race: (asian, african, caucasian) mix for Thai faces, face/body: [(target, weight)] where
#   'eyes/{s}-eye-scale-incr' expands to both sides (l, r).
#
# Thai faces: mostly East/South-East Asian macro with a little 'african' for fuller lips, broader
# noses and darker features, and a little 'caucasian' for variety. Every cast member gets a
# distinct silhouette (height, build, posture) and face (shape, nose, eyes, jaw, ears).

THAI = (0.8, 0.12, 0.08)

BODIES = {
    # ------------------------------------------------------------------ cast (src/game/data/characters.js)
    'ton': dict(sex='m', age=27, h=1.72, muscle=0.45, weight=0.36, prop=0.55, race=(0.82, 0.1, 0.08), face=[
        ('head/head-oval', 0.45), ('chin/chin-prominent-incr', 0.3), ('cheek/{s}-cheek-bones-incr', 0.3),
        ('nose/nose-scale-vert-incr', 0.25), ('nose/nose-hump-incr', 0.25), ('mouth/mouth-lowerlip-volume-incr', 0.2),
        ('eyes/{s}-eye-eyefold-down', 0.2), ('eyebrows/eyebrows-angle-up', 0.15), ('chin/chin-width-decr', 0.15)]),
    'somchai': dict(sex='m', age=56, h=1.68, muscle=0.5, weight=0.6, prop=0.45, race=(0.82, 0.1, 0.08), face=[
        ('head/head-oval', 0.3), ('chin/chin-prominent-incr', 0.3), ('cheek/{s}-cheek-bones-incr', 0.3),
        ('nose/nose-scale-vert-incr', 0.25), ('nose/nose-hump-incr', 0.25), ('nose/nose-volume-incr', 0.3),
        ('head/head-fat-incr', 0.35), ('neck/neck-double-incr', 0.35), ('chin/chin-width-incr', 0.2),
        ('eyes/{s}-eye-bag-incr', 0.6), ('mouth/mouth-angles-down', 0.25), ('mouth/mouth-laugh-lines-in', 0.4)],
        body=[('stomach/stomach-pregnant-incr', 0.25)]),
    'ahKong': dict(sex='m', age=79, h=1.62, muscle=0.3, weight=0.25, prop=0.4, race=(0.95, 0.0, 0.05), face=[
        ('head/head-oval', 0.35), ('cheek/{s}-cheek-volume-decr', 0.7), ('cheek/{s}-cheek-bones-incr', 0.55),
        ('ears/{s}-ear-lobe-incr', 0.9), ('ears/{s}-ear-scale-incr', 0.35), ('nose/nose-hump-incr', 0.25),
        ('nose/nose-point-down', 0.35), ('chin/chin-prominent-incr', 0.25), ('eyes/{s}-eye-bag-incr', 0.8),
        ('eyes/{s}-eye-corner2-down', 0.4), ('mouth/mouth-angles-down', 0.3), ('mouth/mouth-trans-backward', 0.3),
        ('forehead/forehead-temple-decr', 0.6)]),
    'sri': dict(sex='f', age=58, h=1.53, muscle=0.4, weight=0.85, prop=0.4, race=(0.72, 0.2, 0.08), cup=0.7, face=[
        ('head/head-round', 0.7), ('head/head-fat-incr', 0.6), ('neck/neck-double-incr', 0.5),
        ('nose/nose-scale-horiz-incr', 0.4), ('nose/nose-flaring-incr', 0.4), ('cheek/{s}-cheek-volume-incr', 0.45),
        ('mouth/mouth-scale-horiz-incr', 0.2), ('eyes/{s}-eye-bag-incr', 0.4), ('mouth/mouth-laugh-lines-in', 0.5)],
        body=[('stomach/stomach-pregnant-incr', 0.3)]),
    'womanWhite': dict(sex='f', age=24, h=1.60, muscle=0.35, weight=0.25, prop=0.6, race=(0.82, 0.08, 0.1), cup=0.4, face=[
        ('head/head-oval', 0.6), ('chin/chin-width-decr', 0.4), ('eyes/{s}-eye-scale-incr', 0.25),
        ('nose/nose-scale-horiz-decr', 0.3), ('nose/nose-point-width-decr', 0.3), ('mouth/mouth-upperlip-volume-incr', 0.25),
        ('cheek/{s}-cheek-volume-decr', 0.35), ('neck/neck-scale-vert-incr', 0.35), ('eyes/{s}-eye-eyefold-angle-up', 0.25)]),
    'piak': dict(sex='m', age=63, h=1.64, muscle=0.35, weight=0.3, prop=0.35, race=(0.74, 0.18, 0.08), face=[
        ('head/head-rectangular', 0.45), ('nose/nose-volume-incr', 0.55), ('nose/nose-scale-vert-incr', 0.3),
        ('nose/nose-point-down', 0.3), ('eyes/{s}-eye-corner2-down', 0.55), ('eyes/{s}-eye-bag-incr', 0.9),
        ('cheek/{s}-cheek-volume-decr', 0.45), ('mouth/mouth-angles-down', 0.35), ('ears/{s}-ear-flap-incr', 0.5),
        ('chin/chin-prominent-decr', 0.25), ('mouth/mouth-laugh-lines-in', 0.6)]),
    'boyM': dict(sex='m', age=9, h=1.30, muscle=0.45, weight=0.4, prop=0.5, race=(0.84, 0.1, 0.06), face=[
        ('head/head-round', 0.35), ('eyes/{s}-eye-scale-incr', 0.2), ('nose/nose-scale-vert-decr', 0.2),
        ('ears/{s}-ear-flap-incr', 0.35), ('cheek/{s}-cheek-volume-incr', 0.2)]),
    'nuan': dict(sex='f', age=26, h=1.62, muscle=0.4, weight=0.35, prop=0.75, race=(0.8, 0.1, 0.1), cup=0.55, face=[
        ('head/head-oval', 0.5), ('mouth/mouth-upperlip-volume-incr', 0.35), ('mouth/mouth-lowerlip-volume-incr', 0.3),
        ('mouth/mouth-cupidsbow-incr', 0.45), ('eyes/{s}-eye-eyefold-angle-up', 0.35), ('cheek/{s}-cheek-bones-incr', 0.3),
        ('eyebrows/eyebrows-angle-up', 0.2), ('nose/nose-scale-horiz-decr', 0.1), ('chin/chin-triangle', 0.2)]),
    'monk': dict(sex='m', age=44, h=1.70, muscle=0.45, weight=0.33, prop=0.6, race=(0.8, 0.12, 0.08), face=[
        ('head/head-square', 0.3), ('ears/{s}-ear-scale-incr', 0.45), ('ears/{s}-ear-lobe-incr', 0.6),
        ('chin/chin-width-incr', 0.2), ('nose/nose-scale-horiz-incr', 0.2), ('eyes/{s}-eye-eyefold-down', 0.35),
        ('head/head-scale-vert-incr', 0.15), ('forehead/forehead-scale-vert-incr', 0.3)]),
    'saman': dict(sex='m', age=50, h=1.70, muscle=0.55, weight=0.55, prop=0.5, race=(0.78, 0.14, 0.08), face=[
        ('head/head-square', 0.6), ('chin/chin-width-incr', 0.45), ('cheek/{s}-cheek-bones-incr', 0.4),
        ('nose/nose-volume-incr', 0.2), ('mouth/mouth-scale-horiz-incr', 0.25), ('eyebrows/eyebrows-trans-down', 0.25),
        ('chin/chin-jaw-drop-incr', 0.3), ('mouth/mouth-laugh-lines-in', 0.4)]),
    'bua': dict(sex='f', age=81, h=1.45, muscle=0.3, weight=0.32, prop=0.35, race=(0.78, 0.14, 0.08), cup=0.35, face=[
        ('head/head-round', 0.35), ('cheek/{s}-cheek-volume-decr', 0.45), ('mouth/mouth-trans-backward', 0.45),
        ('chin/chin-prominent-incr', 0.35), ('nose/nose-point-down', 0.4), ('eyes/{s}-eye-bag-incr', 0.7),
        ('ears/{s}-ear-lobe-incr', 0.7), ('mouth/mouth-laugh-lines-in', 0.7), ('mouth/mouth-angles-up', 0.2)]),
    'auntieLek': dict(sex='f', age=55, h=1.55, muscle=0.45, weight=0.6, prop=0.45, race=(0.75, 0.17, 0.08), face=[
        ('head/head-round', 0.3), ('cheek/{s}-cheek-volume-incr', 0.35), ('nose/nose-scale-horiz-incr', 0.3),
        ('mouth/mouth-angles-up', 0.35), ('eyes/{s}-eye-bag-incr', 0.35), ('mouth/mouth-laugh-lines-in', 0.4)]),
    'mMother': dict(sex='f', age=38, h=1.56, muscle=0.4, weight=0.3, prop=0.5, race=(0.8, 0.12, 0.08), face=[
        ('head/head-triangular', 0.35), ('cheek/{s}-cheek-volume-decr', 0.35), ('eyes/{s}-eye-bag-incr', 0.45),
        ('mouth/mouth-angles-down', 0.2), ('nose/nose-scale-vert-incr', 0.2), ('chin/chin-width-decr', 0.2)]),
    'extraChild': dict(sex='f', age=8, h=1.24, muscle=0.4, weight=0.35, prop=0.5, race=(0.84, 0.08, 0.08), face=[
        ('head/head-round', 0.4), ('eyes/{s}-eye-scale-incr', 0.3), ('nose/nose-scale-vert-decr', 0.25)]),
    # ------------------------------------------------------------------ extras: background people, generics, ghost bodies
    'm_young': dict(sex='m', age=30, h=1.70, muscle=0.55, weight=0.5, prop=0.5, race=THAI, face=[
        ('head/head-square', 0.25), ('nose/nose-scale-horiz-incr', 0.25), ('mouth/mouth-scale-horiz-incr', 0.15)]),
    'm_tall': dict(sex='m', age=35, h=1.85, muscle=0.3, weight=0.12, prop=0.25, race=(0.78, 0.12, 0.1), face=[
        ('head/head-rectangular', 0.5), ('cheek/{s}-cheek-volume-decr', 0.8), ('chin/chin-height-incr', 0.4),
        ('nose/nose-scale-vert-incr', 0.4), ('neck/neck-scale-vert-incr', 0.5)]),
    'm_potbelly': dict(sex='m', age=52, h=1.66, muscle=0.4, weight=0.75, prop=0.4, race=(0.74, 0.18, 0.08), face=[
        ('head/head-round', 0.5), ('head/head-fat-incr', 0.5), ('neck/neck-double-incr', 0.6), ('nose/nose-volume-incr', 0.3)],
        body=[('stomach/stomach-pregnant-incr', 0.7)]),
    'm_stocky': dict(sex='m', age=40, h=1.63, muscle=0.8, weight=0.65, prop=0.45, race=(0.72, 0.2, 0.08), face=[
        ('head/head-square', 0.6), ('chin/chin-width-incr', 0.5), ('neck/neck-scale-horiz-incr', 0.4), ('nose/nose-flaring-incr', 0.4)]),
    'm_old': dict(sex='m', age=73, h=1.62, muscle=0.3, weight=0.3, prop=0.35, race=THAI, face=[
        ('head/head-oval', 0.3), ('cheek/{s}-cheek-volume-decr', 0.5), ('eyes/{s}-eye-bag-incr', 0.8),
        ('ears/{s}-ear-lobe-incr', 0.6), ('nose/nose-point-down', 0.4), ('mouth/mouth-trans-backward', 0.3)]),
    'f_young': dict(sex='f', age=25, h=1.58, muscle=0.45, weight=0.45, prop=0.55, race=THAI, cup=0.5, face=[
        ('head/head-round', 0.25), ('eyes/{s}-eye-scale-incr', 0.1), ('mouth/mouth-lowerlip-volume-incr', 0.25)]),
    'f_mid': dict(sex='f', age=46, h=1.57, muscle=0.45, weight=0.65, prop=0.45, race=(0.76, 0.16, 0.08), cup=0.6, face=[
        ('head/head-square', 0.3), ('cheek/{s}-cheek-volume-incr', 0.3), ('nose/nose-scale-horiz-incr', 0.3),
        ('eyes/{s}-eye-bag-incr', 0.3)]),
    'f_old': dict(sex='f', age=86, h=1.45, muscle=0.25, weight=0.2, prop=0.3, race=(0.76, 0.16, 0.08), cup=0.3, face=[
        ('head/head-oval', 0.3), ('cheek/{s}-cheek-volume-decr', 0.8), ('mouth/mouth-trans-backward', 0.6),
        ('chin/chin-prominent-incr', 0.5), ('nose/nose-point-down', 0.5), ('eyes/{s}-eye-bag-incr', 0.9),
        ('ears/{s}-ear-lobe-incr', 0.8), ('nose/nose-hump-incr', 0.4)]),
    'f_old2': dict(sex='f', age=70, h=1.50, muscle=0.35, weight=0.7, prop=0.4, race=THAI, cup=0.6, face=[
        ('head/head-round', 0.5), ('head/head-fat-incr', 0.4), ('neck/neck-double-incr', 0.5), ('eyes/{s}-eye-bag-incr', 0.6)],
        body=[('stomach/stomach-pregnant-incr', 0.3)]),
    'child_m': dict(sex='m', age=7, h=1.18, muscle=0.4, weight=0.45, prop=0.5, race=THAI, face=[
        ('head/head-round', 0.5), ('ears/{s}-ear-flap-incr', 0.2)]),
    'child_f': dict(sex='f', age=11, h=1.40, muscle=0.4, weight=0.3, prop=0.5, race=THAI, face=[
        ('head/head-oval', 0.3), ('eyes/{s}-eye-scale-incr', 0.15)]),
}

# Face-detail targets shipped for runtime variety (randomPerson) — signed pairs become one axis.
FACE_AXES = [
    ('headRound', 'head/head-round', None), ('headOval', 'head/head-oval', None), ('headSquare', 'head/head-square', None),
    ('headTri', 'head/head-triangular', None), ('headFat', 'head/head-fat-incr', 'head/head-fat-decr'),
    ('noseWidth', 'nose/nose-scale-horiz-incr', 'nose/nose-scale-horiz-decr'), ('noseLength', 'nose/nose-scale-vert-incr', 'nose/nose-scale-vert-decr'),
    ('noseVolume', 'nose/nose-volume-incr', 'nose/nose-volume-decr'), ('noseHump', 'nose/nose-hump-incr', 'nose/nose-hump-decr'),
    ('noseFlare', 'nose/nose-flaring-incr', 'nose/nose-flaring-decr'), ('noseTip', 'nose/nose-point-up', 'nose/nose-point-down'),
    ('eyeSize', 'eyes/{s}-eye-scale-incr', 'eyes/{s}-eye-scale-decr'), ('eyeFold', 'eyes/{s}-eye-eyefold-down', 'eyes/{s}-eye-eyefold-up'),
    ('eyeTilt', 'eyes/{s}-eye-eyefold-angle-up', 'eyes/{s}-eye-eyefold-angle-down'), ('eyeBags', 'eyes/{s}-eye-bag-incr', 'eyes/{s}-eye-bag-decr'),
    ('eyeDroop', 'eyes/{s}-eye-corner2-down', 'eyes/{s}-eye-corner2-up'),
    ('jawWidth', 'chin/chin-width-incr', 'chin/chin-width-decr'), ('chin', 'chin/chin-prominent-incr', 'chin/chin-prominent-decr'),
    ('chinHeight', 'chin/chin-height-incr', 'chin/chin-height-decr'),
    ('cheekBones', 'cheek/{s}-cheek-bones-incr', 'cheek/{s}-cheek-bones-decr'), ('cheekFull', 'cheek/{s}-cheek-volume-incr', 'cheek/{s}-cheek-volume-decr'),
    ('mouthWidth', 'mouth/mouth-scale-horiz-incr', 'mouth/mouth-scale-horiz-decr'), ('lipsFull', 'mouth/mouth-lowerlip-volume-incr', 'mouth/mouth-lowerlip-volume-decr'),
    ('upperLip', 'mouth/mouth-upperlip-volume-incr', 'mouth/mouth-upperlip-volume-decr'), ('mouthCorners', 'mouth/mouth-angles-up', 'mouth/mouth-angles-down'),
    ('earSize', 'ears/{s}-ear-scale-incr', 'ears/{s}-ear-scale-decr'), ('earFlap', 'ears/{s}-ear-flap-incr', 'ears/{s}-ear-flap-decr'),
    ('earLobe', 'ears/{s}-ear-lobe-incr', 'ears/{s}-ear-lobe-decr'), ('browHeight', 'eyebrows/eyebrows-trans-up', 'eyebrows/eyebrows-trans-down'),
    ('neckDouble', 'neck/neck-double-incr', None), ('laughLines', 'mouth/mouth-laugh-lines-in', 'mouth/mouth-laugh-lines-out'),
    ('belly', 'stomach/stomach-pregnant-incr', 'stomach/stomach-pregnant-decr'),
]

# The ghost "uncanny" morph: proportions a few percent wrong (eyes apart and larger, mouth wider, neck longer).
UNCANNY = [
    ('eyes/{s}-eye-trans-out', 0.55), ('eyes/{s}-eye-scale-incr', 0.35), ('mouth/mouth-scale-horiz-incr', 0.6),
    ('neck/neck-scale-vert-incr', 0.8), ('mouth/mouth-trans-down', 0.2), ('cheek/{s}-cheek-volume-decr', 0.6),
    ('forehead/forehead-temple-decr', 0.5), ('chin/chin-height-incr', 0.3),
]

# ARKit face units kept for the runtime (morph targets).
FACEUNITS = [
    'eyeBlinkLeft', 'eyeBlinkRight', 'eyeWideLeft', 'eyeWideRight', 'eyeSquintLeft', 'eyeSquintRight',
    'eyeLookDownLeft', 'eyeLookDownRight', 'eyeLookUpLeft', 'eyeLookUpRight',
    'browInnerUp', 'browDownLeft', 'browDownRight', 'browOuterUpLeft', 'browOuterUpRight',
    'jawOpen', 'mouthClose', 'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight',
    'mouthStretchLeft', 'mouthStretchRight', 'mouthPucker', 'mouthFunnel', 'mouthLowerDownLeft', 'mouthLowerDownRight',
    'mouthUpperUpLeft', 'mouthUpperUpRight', 'noseSneerLeft', 'noseSneerRight', 'cheekSquintLeft', 'cheekSquintRight',
]

# Head proxies (MakeHuman system assets + CC0 community packs) baked as fitted proxies.
# Only assets whose files and pack metadata both say CC0 (several hair01 items carry an AGPL3 MakeClothes
# header that contradicts the pack's CC0 tag, so they are left out). The bun is our own (shells.bun()).
HAIR = {
    'long': 'long01/long01.mhclo',
    'bob': 'toigo_blunt_bob_with_bangs/toigo_blunt_bob_with_bangs.mhclo',
    'bobPlain': 'bob02/bob02.mhclo',
    'bobShort': 'bob01/bob01.mhclo',
    'ponytail': 'ponytail01/ponytail01.mhclo',
    'braid': 'braid01/braid01.mhclo',
    'short': 'short02/short02.mhclo',
    'crop': 'short01/short01.mhclo',
    'messy': 'cortu_short_messy_hair/cortu_short_messy_hair.mhclo',
    'swept': 'short04/short04.mhclo',
    'shag': 'short03/short03.mhclo',
    'curls': 'afro01/afro01.mhclo',
}
BROWS = {'thin': 'eyebrow010/eyebrow010.mhclo', 'medium': 'eyebrow001/eyebrow001.mhclo', 'thick': 'eyebrow003/eyebrow003.mhclo', 'soft': 'eyebrow006/eyebrow006.mhclo'}
LASHES = {'f': 'eyelashes01/eyelashes01.mhclo', 'm': 'eyelashes02/eyelashes02.mhclo'}
