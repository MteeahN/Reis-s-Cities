import { useEffect, useRef } from 'react';
import { GRID_CELLS, WORLD_SIZE } from '../../game/core/config';
import { getGame } from '../../store/gameBridge';
import { useGameStore } from '../../store/gameStore';

const SIZE = 184;

/** Top-down map with the camera's position/heading; click to fly there. */
export function Minimap() {
  const world = useGameStore((s) => s.world);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = baseRef.current;
    if (!canvas || !world) return;
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = GRID_CELLS;
    const tctx = tmp.getContext('2d')!;
    const img = tctx.createImageData(GRID_CELLS, GRID_CELLS);
    img.data.set(world.minimap);
    tctx.putImageData(img, 0, 0);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tmp, 0, 0, SIZE, SIZE);
  }, [world]);

  useEffect(() => {
    const draw = (cam = useGameStore.getState().camera) => {
      const canvas = overlayRef.current;
      if (!canvas || !cam) return;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, SIZE, SIZE);
      const s = SIZE / WORLD_SIZE;
      const x = cam.x * s;
      const y = cam.z * s;
      // View footprint approximation, scaled with zoom.
      const r = Math.max(6, cam.distance * s * 0.9);
      const fx = -Math.sin(cam.yaw);
      const fz = -Math.cos(cam.yaw);
      const a = Math.atan2(fz, fx);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, r, a - 0.55, a + 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#3fd1a0';
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    };
    draw();
    return useGameStore.subscribe((s, prev) => {
      if (s.camera !== prev.camera) draw(s.camera);
    });
  }, []);

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * WORLD_SIZE;
    const z = ((e.clientY - r.top) / r.height) * WORLD_SIZE;
    getGame()?.focusWorldPoint(x, z);
  };

  return (
    <div className="panel minimap" title="Haritaya tıklayarak oraya gidin">
      <div className="minimap-canvas" onClick={onClick} style={{ width: SIZE, height: SIZE }} data-testid="minimap">
        <canvas ref={baseRef} width={SIZE} height={SIZE} />
        <canvas ref={overlayRef} width={SIZE} height={SIZE} />
      </div>
      <div className="minimap-legend">
        <span><i className="sw own" /> Şehre ait</span>
        <span><i className="sw locked" /> Kilitli</span>
      </div>
    </div>
  );
}
