import { useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import './TargetCursor.css';

const getContainingBlock = element => {
  let node = element?.parentElement;
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node);
    if (
      style.transform !== 'none' ||
      style.perspective !== 'none' ||
      style.filter !== 'none' ||
      style.willChange.includes('transform') ||
      style.willChange.includes('perspective') ||
      style.willChange.includes('filter') ||
      /paint|layout|strict|content/.test(style.contain)
    ) return node;
    node = node.parentElement;
  }
  return null;
};

const getContainingBlockOffset = block => {
  if (!block) return { x: 0, y: 0 };
  const rect = block.getBoundingClientRect();
  return { x: rect.left + block.clientLeft, y: rect.top + block.clientTop };
};

const TargetCursor = ({
  targetSelector = '.cursor-target',
  spinDuration = 2,
  hideDefaultCursor = true,
  hoverDuration = 0.2,
  parallaxOn = true,
  cursorColor = '#ffffff',
  cursorColorOnTarget
}) => {
  const cursorRef = useRef(null);
  const cornersRef = useRef(null);
  const spinTl = useRef(null);
  const dotRef = useRef(null);
  const containingBlockRef = useRef(null);
  const targetCornerPositionsRef = useRef(null);
  const tickerFnRef = useRef(null);
  const activeStrengthRef = useRef(0);

  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth <= 768;
    const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
    return (hasTouchScreen && isSmallScreen) || mobileRegex.test(navigator.userAgent.toLowerCase());
  }, []);

  const constants = useMemo(() => ({ borderWidth: 3, cornerSize: 12 }), []);

  const moveCursor = useCallback((x, y) => {
    if (!cursorRef.current) return;
    const { x: offsetX, y: offsetY } = getContainingBlockOffset(containingBlockRef.current);
    gsap.to(cursorRef.current, { x: x - offsetX, y: y - offsetY, duration: 0.1, ease: 'power3.out' });
  }, []);

  useEffect(() => {
    if (isMobile || !cursorRef.current) return undefined;
    const originalCursor = document.body.style.cursor;
    if (hideDefaultCursor) document.body.style.cursor = 'none';

    const cursor = cursorRef.current;
    cornersRef.current = cursor.querySelectorAll('.target-cursor-corner');
    containingBlockRef.current = getContainingBlock(cursor);
    const getOffset = () => getContainingBlockOffset(containingBlockRef.current);
    let activeTarget = null;
    let currentLeaveHandler = null;
    let resumeTimeout = null;

    const cleanupTarget = target => {
      if (currentLeaveHandler) target.removeEventListener('mouseleave', currentLeaveHandler);
      currentLeaveHandler = null;
    };

    const initialOffset = getOffset();
    gsap.set(cursor, { xPercent: -50, yPercent: -50, x: window.innerWidth / 2 - initialOffset.x, y: window.innerHeight / 2 - initialOffset.y });

    const createSpinTimeline = () => {
      spinTl.current?.kill();
      spinTl.current = gsap.timeline({ repeat: -1 }).to(cursor, { rotation: '+=360', duration: spinDuration, ease: 'none' });
    };
    createSpinTimeline();

    const tickerFn = () => {
      if (!targetCornerPositionsRef.current || !cornersRef.current) return;
      const strength = activeStrengthRef.current;
      if (strength === 0) return;
      const cursorX = gsap.getProperty(cursor, 'x');
      const cursorY = gsap.getProperty(cursor, 'y');
      Array.from(cornersRef.current).forEach((corner, i) => {
        const currentX = gsap.getProperty(corner, 'x');
        const currentY = gsap.getProperty(corner, 'y');
        const targetX = targetCornerPositionsRef.current[i].x - cursorX;
        const targetY = targetCornerPositionsRef.current[i].y - cursorY;
        const finalX = currentX + (targetX - currentX) * strength;
        const finalY = currentY + (targetY - currentY) * strength;
        const duration = strength >= 0.99 ? (parallaxOn ? 0.2 : 0) : 0.05;
        gsap.to(corner, { x: finalX, y: finalY, duration, ease: duration === 0 ? 'none' : 'power1.out', overwrite: 'auto' });
      });
    };
    tickerFnRef.current = tickerFn;

    const moveHandler = event => moveCursor(event.clientX, event.clientY);
    const scrollHandler = () => {
      if (!activeTarget) return;
      const { x: offsetX, y: offsetY } = getOffset();
      const mouseX = gsap.getProperty(cursor, 'x') + offsetX;
      const mouseY = gsap.getProperty(cursor, 'y') + offsetY;
      const underMouse = document.elementFromPoint(mouseX, mouseY);
      if (!underMouse || (underMouse !== activeTarget && !underMouse.closest(targetSelector)?.isSameNode(activeTarget))) currentLeaveHandler?.();
    };
    const mouseDownHandler = () => { gsap.to(dotRef.current, { scale: 0.7, duration: 0.3 }); gsap.to(cursor, { scale: 0.9, duration: 0.2 }); };
    const mouseUpHandler = () => { gsap.to(dotRef.current, { scale: 1, duration: 0.3 }); gsap.to(cursor, { scale: 1, duration: 0.2 }); };

    const enterHandler = event => {
      let current = event.target;
      let target = null;
      while (current && current !== document.body) {
        if (current.matches?.(targetSelector)) { target = current; break; }
        current = current.parentElement;
      }
      if (!target || target === activeTarget) return;
      if (activeTarget) cleanupTarget(activeTarget);
      if (resumeTimeout) { clearTimeout(resumeTimeout); resumeTimeout = null; }
      activeTarget = target;
      const corners = Array.from(cornersRef.current);
      corners.forEach(corner => gsap.killTweensOf(corner, 'x,y'));
      gsap.killTweensOf(cursor, 'rotation');
      spinTl.current?.pause();
      gsap.set(cursor, { rotation: 0 });

      if (cursorColorOnTarget) {
        gsap.to(corners, { borderColor: cursorColorOnTarget, duration: 0.15, ease: 'power2.out' });
        gsap.to(dotRef.current, { backgroundColor: cursorColorOnTarget, duration: 0.15, ease: 'power2.out' });
      }

      const rect = target.getBoundingClientRect();
      const { borderWidth, cornerSize } = constants;
      const { x: offsetX, y: offsetY } = getOffset();
      const cursorX = gsap.getProperty(cursor, 'x');
      const cursorY = gsap.getProperty(cursor, 'y');
      targetCornerPositionsRef.current = [
        { x: rect.left - borderWidth - offsetX, y: rect.top - borderWidth - offsetY },
        { x: rect.right + borderWidth - cornerSize - offsetX, y: rect.top - borderWidth - offsetY },
        { x: rect.right + borderWidth - cornerSize - offsetX, y: rect.bottom + borderWidth - cornerSize - offsetY },
        { x: rect.left - borderWidth - offsetX, y: rect.bottom + borderWidth - cornerSize - offsetY }
      ];
      gsap.ticker.add(tickerFnRef.current);
      gsap.to(activeStrengthRef, { current: 1, duration: hoverDuration, ease: 'power2.out' });
      corners.forEach((corner, i) => gsap.to(corner, { x: targetCornerPositionsRef.current[i].x - cursorX, y: targetCornerPositionsRef.current[i].y - cursorY, duration: 0.2, ease: 'power2.out' }));

      const leaveHandler = () => {
        gsap.ticker.remove(tickerFnRef.current);
        targetCornerPositionsRef.current = null;
        gsap.set(activeStrengthRef, { current: 0, overwrite: true });
        activeTarget = null;
        if (cursorColorOnTarget) {
          gsap.to(corners, { borderColor: cursorColor, duration: 0.15 });
          gsap.to(dotRef.current, { backgroundColor: cursorColor, duration: 0.15 });
        }
        const positions = [{ x: -18, y: -18 }, { x: 6, y: -18 }, { x: 6, y: 6 }, { x: -18, y: 6 }];
        corners.forEach((corner, index) => gsap.to(corner, { x: positions[index].x, y: positions[index].y, duration: 0.3, ease: 'power3.out' }));
        resumeTimeout = setTimeout(() => {
          if (!activeTarget && spinTl.current) {
            const rotation = gsap.getProperty(cursor, 'rotation') % 360;
            spinTl.current.kill();
            spinTl.current = gsap.timeline({ repeat: -1 }).to(cursor, { rotation: '+=360', duration: spinDuration, ease: 'none' });
            gsap.set(cursor, { rotation });
          }
          resumeTimeout = null;
        }, 50);
        cleanupTarget(target);
      };
      currentLeaveHandler = leaveHandler;
      target.addEventListener('mouseleave', leaveHandler);
    };

    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseover', enterHandler, { passive: true });
    window.addEventListener('scroll', scrollHandler, { passive: true });
    window.addEventListener('mousedown', mouseDownHandler);
    window.addEventListener('mouseup', mouseUpHandler);
    const resizeHandler = () => { containingBlockRef.current = getContainingBlock(cursor); };
    window.addEventListener('resize', resizeHandler);

    return () => {
      if (tickerFnRef.current) gsap.ticker.remove(tickerFnRef.current);
      window.removeEventListener('mousemove', moveHandler); window.removeEventListener('mouseover', enterHandler); window.removeEventListener('scroll', scrollHandler); window.removeEventListener('mousedown', mouseDownHandler); window.removeEventListener('mouseup', mouseUpHandler); window.removeEventListener('resize', resizeHandler);
      if (activeTarget) cleanupTarget(activeTarget);
      if (resumeTimeout) clearTimeout(resumeTimeout);
      spinTl.current?.kill();
      document.body.style.cursor = originalCursor;
    };
  }, [targetSelector, spinDuration, moveCursor, constants, hideDefaultCursor, isMobile, hoverDuration, parallaxOn, cursorColor, cursorColorOnTarget]);

  useEffect(() => {
    if (!isMobile && cursorRef.current && spinTl.current) {
      spinTl.current.kill();
      spinTl.current = gsap.timeline({ repeat: -1 }).to(cursorRef.current, { rotation: '+=360', duration: spinDuration, ease: 'none' });
    }
  }, [spinDuration, isMobile]);

  if (isMobile || typeof document === 'undefined') return null;
  return createPortal(
    <div ref={cursorRef} className="target-cursor-wrapper">
      <div ref={dotRef} className="target-cursor-dot" style={{ backgroundColor: cursorColor }} />
      <div className="target-cursor-corner corner-tl" style={{ borderColor: cursorColor }} />
      <div className="target-cursor-corner corner-tr" style={{ borderColor: cursorColor }} />
      <div className="target-cursor-corner corner-br" style={{ borderColor: cursorColor }} />
      <div className="target-cursor-corner corner-bl" style={{ borderColor: cursorColor }} />
    </div>, document.body
  );
};

export default TargetCursor;
