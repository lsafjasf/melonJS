// Canvas path shapes for the three actors plus the stage backdrop.
// Each draw function renders centred on (0, 0) so the editor can apply
// translate / rotate / scale around the shape's own origin.

export const STAGE_WIDTH = 960;
export const STAGE_HEIGHT = 540;
export const WATER_LINE = 380; // y of the river surface

export function drawMoon(ctx) {
	// glowing disc with a couple of craters, all path-based
	ctx.save();
	ctx.shadowColor = "rgba(255, 240, 180, 0.9)";
	ctx.shadowBlur = 40;
	ctx.beginPath();
	ctx.arc(0, 0, 55, 0, Math.PI * 2);
	ctx.fillStyle = "#f7e9b0";
	ctx.fill();
	ctx.restore();
	ctx.beginPath();
	ctx.arc(-18, -12, 10, 0, Math.PI * 2);
	ctx.arc(14, 8, 7, 0, Math.PI * 2);
	ctx.arc(-4, 24, 5, 0, Math.PI * 2);
	ctx.fillStyle = "rgba(214, 192, 130, 0.7)";
	ctx.fill();
}

export function drawBoat(ctx) {
	// classic folded paper boat silhouette
	ctx.beginPath();
	ctx.moveTo(-90, 0); // stern
	ctx.lineTo(-55, 38);
	ctx.lineTo(55, 38);
	ctx.lineTo(90, 0); // bow
	ctx.closePath();
	ctx.fillStyle = "#f4f1e6";
	ctx.fill();
	ctx.strokeStyle = "#b9b2a0";
	ctx.lineWidth = 2;
	ctx.stroke();
	// sail fold
	ctx.beginPath();
	ctx.moveTo(-40, 0);
	ctx.lineTo(0, -58);
	ctx.lineTo(40, 0);
	ctx.closePath();
	ctx.fillStyle = "#ffffff";
	ctx.fill();
	ctx.stroke();
	// fold crease
	ctx.beginPath();
	ctx.moveTo(0, -58);
	ctx.lineTo(0, 0);
	ctx.strokeStyle = "#d8d2c2";
	ctx.stroke();
}

export function drawPerson(ctx) {
	// a small figure waving one arm; the whole body rocks with the
	// rotation keyframes, which reads as waving (no skeleton needed)
	ctx.strokeStyle = "#d9c9a3";
	ctx.fillStyle = "#d9c9a3";
	ctx.lineWidth = 7;
	ctx.lineCap = "round";
	// head
	ctx.beginPath();
	ctx.arc(0, -52, 14, 0, Math.PI * 2);
	ctx.fill();
	// body
	ctx.beginPath();
	ctx.moveTo(0, -38);
	ctx.lineTo(0, 10);
	ctx.stroke();
	// legs
	ctx.beginPath();
	ctx.moveTo(0, 10);
	ctx.lineTo(-14, 44);
	ctx.moveTo(0, 10);
	ctx.lineTo(14, 44);
	ctx.stroke();
	// waving arm (raised) + resting arm
	ctx.beginPath();
	ctx.moveTo(0, -28);
	ctx.lineTo(26, -58); // raised arm, sweeps when the body rotates
	ctx.moveTo(0, -28);
	ctx.lineTo(-20, -6);
	ctx.stroke();
	// hand
	ctx.beginPath();
	ctx.arc(28, -60, 5, 0, Math.PI * 2);
	ctx.fill();
}

const STAR_SEED = [
	[60, 60], [150, 130], [240, 50], [330, 110], [420, 70], [510, 140],
	[600, 60], [860, 140], [920, 60], [80, 220], [200, 260], [380, 200],
	[520, 240], [640, 180], [700, 250], [900, 230], [40, 320], [300, 300],
];

export function drawStage(ctx, time) {
	// night sky
	const sky = ctx.createLinearGradient(0, 0, 0, WATER_LINE);
	sky.addColorStop(0, "#0b1026");
	sky.addColorStop(1, "#1d2b4d");
	ctx.fillStyle = sky;
	ctx.fillRect(0, 0, STAGE_WIDTH, WATER_LINE);
	// twinkling stars
	ctx.fillStyle = "#cfd8ff";
	for (let i = 0; i < STAR_SEED.length; i++) {
		const [sx, sy] = STAR_SEED[i];
		const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(time * 1.5 + i));
		ctx.globalAlpha = twinkle;
		ctx.fillRect(sx, sy, 2, 2);
	}
	ctx.globalAlpha = 1;
	// river
	const water = ctx.createLinearGradient(0, WATER_LINE, 0, STAGE_HEIGHT);
	water.addColorStop(0, "#274b6d");
	water.addColorStop(1, "#10263c");
	ctx.fillStyle = water;
	ctx.fillRect(0, WATER_LINE, STAGE_WIDTH, STAGE_HEIGHT - WATER_LINE);
	// drifting wave lines
	ctx.strokeStyle = "rgba(160, 200, 235, 0.25)";
	ctx.lineWidth = 2;
	for (let row = 0; row < 4; row++) {
		const y = WATER_LINE + 24 + row * 34;
		ctx.beginPath();
		for (let x = 0; x <= STAGE_WIDTH; x += 16) {
			const yy = y + Math.sin(x / 40 + time * 1.2 + row * 1.7) * 4;
			if (x === 0) ctx.moveTo(x, yy);
			else ctx.lineTo(x, yy);
		}
		ctx.stroke();
	}
	// far bank silhouette where the person stands
	ctx.fillStyle = "#0a1a2b";
	ctx.beginPath();
	ctx.moveTo(760, WATER_LINE);
	ctx.quadraticCurveTo(860, WATER_LINE - 46, 960, WATER_LINE - 10);
	ctx.lineTo(960, WATER_LINE);
	ctx.closePath();
	ctx.fill();
}
