/** Test helpers: fake MoveNet poses in camera pixels (640x480). */
export const OPTS = { width: 640, height: 480, mirrored: true, minKeypointScore: 0.3, maxPitch: Math.PI / 6, maxYaw: Math.PI / 2 };

export function pose({ cx = 320, shoulderW = 120, tilt = 0, wrists = true, score = 0.9, wristY = 150 } = {}) {
    const k = (name, x, y, s = score) => ({ name, x, y, score: s });
    const kps = [
        // Person's left is imaged at higher pixel x by a front-facing camera.
        k('left_shoulder', cx + shoulderW / 2, 200 - tilt),
        k('right_shoulder', cx - shoulderW / 2, 200 + tilt),
        k('left_hip', cx + 50, 350),
        k('right_hip', cx - 50, 350)
    ];
    if (wrists) kps.push(k('left_wrist', cx + 150, wristY), k('right_wrist', cx - 150, wristY));
    return { keypoints: kps };
}
