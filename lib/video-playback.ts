import type { CSSProperties } from 'react';

export type VideoRotation = 0 | 90 | 180 | 270;

// Turns the stage that hosts the video into a CSS size container. That is what lets the cqw/cqh units below
// size the video against either axis of the box — unlike %, a container query unit can reference the box's
// cross axis, which is exactly what a 90/270 rotation needs.
export function videoStageStyle(): CSSProperties {
  return { containerType: 'size' } as CSSProperties;
}

// Rotates the video in place. For 0/180 this is a plain rotation — the box and the video keep the same shape,
// so nothing else needs to change. For 90/270 the video's own pre-rotation width/height are swapped to the
// stage's cross-axis dimensions (100cqh/100cqw), so that once rotated, its bounding box exactly refills the
// stage instead of overflowing it or being cropped by the stage's overflow:hidden.
export function videoTransformStyle(rotation: VideoRotation): CSSProperties {
  if (rotation === 90 || rotation === 270) {
    return {
      position: 'absolute', top: '50%', left: '50%',
      width: '100cqh', height: '100cqw', objectFit: 'contain',
      transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
    } as CSSProperties;
  }
  return { transform: `rotate(${rotation}deg)` };
}

// Keeps playback inside [start,end): the same clamping logic runs in the editor's live preview and on the
// published page, so trimming a clip and watching it after publishing look identical. end===0 is the "unset"
// sentinel from ProjectData — it means "play to the video's natural end" rather than "trim everything".
export function clampVideoPlayback(video: HTMLVideoElement, start: number, end: number) {
  const boundedEnd = () => (end > 0 ? end : Infinity);
  const toStart = () => { if (start > 0 && video.currentTime < start) video.currentTime = start; };
  const onTimeUpdate = () => {
    if (video.currentTime < start) { video.currentTime = start; return; }
    if (video.currentTime >= boundedEnd()) { video.pause(); video.currentTime = start; }
  };
  video.addEventListener('loadedmetadata', toStart);
  video.addEventListener('timeupdate', onTimeUpdate);
  if (video.readyState >= 1) toStart();
  return () => { video.removeEventListener('loadedmetadata', toStart); video.removeEventListener('timeupdate', onTimeUpdate); };
}
