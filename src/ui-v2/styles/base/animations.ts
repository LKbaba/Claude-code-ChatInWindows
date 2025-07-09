/**
 * Animation Styles - Keyframes and transition utilities
 */

export const animationStyles = `
/* ===================================
 * Animations & Transitions
 * =================================== */

/* Keyframe Animations */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes fadeOut {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

@keyframes slideIn {
  from {
    transform: translateY(var(--space-lg));
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes slideDown {
  from {
    transform: translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes slideInLeft {
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes scaleIn {
  from {
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes scaleOut {
  from {
    transform: scale(1);
    opacity: 1;
  }
  to {
    transform: scale(0.95);
    opacity: 0;
  }
}

@keyframes bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 0.6;
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(35, 206, 107, 0.7);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
    box-shadow: 0 0 0 8px rgba(35, 206, 107, 0);
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

@keyframes messageSlideIn {
  from {
    opacity: 0;
    transform: translateY(var(--space-lg)) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes toolLoading {
  0% {
    transform: scaleX(0);
    transform-origin: left;
  }
  50% {
    transform: scaleX(1);
    transform-origin: left;
  }
  51% {
    transform: scaleX(1);
    transform-origin: right;
  }
  100% {
    transform: scaleX(0);
    transform-origin: right;
  }
}

@keyframes typewriter {
  from {
    width: 0;
  }
  to {
    width: 100%;
  }
}

@keyframes blink {
  0%, 50% {
    opacity: 1;
  }
  51%, 100% {
    opacity: 0;
  }
}

/* Animation Classes */
.animate-fadeIn {
  animation: fadeIn var(--transition-normal) ease-out;
}

.animate-fadeOut {
  animation: fadeOut var(--transition-normal) ease-out;
}

.animate-slideIn {
  animation: slideIn var(--transition-normal) ease-out;
}

.animate-slideUp {
  animation: slideUp var(--transition-normal) ease-out;
}

.animate-slideDown {
  animation: slideDown var(--transition-normal) ease-out;
}

.animate-slideInLeft {
  animation: slideInLeft var(--transition-normal) ease-out;
}

.animate-slideInRight {
  animation: slideInRight var(--transition-normal) ease-out;
}

.animate-scaleIn {
  animation: scaleIn var(--transition-normal) ease-out;
}

.animate-scaleOut {
  animation: scaleOut var(--transition-normal) ease-out;
}

.animate-bounce {
  animation: bounce 1s ease-in-out infinite;
}

.animate-pulse {
  animation: pulse 2s ease-in-out infinite;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

.animate-shimmer {
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.1) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

/* Transition Utilities */
.transition-none {
  transition: none;
}

.transition-all {
  transition-property: all;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: var(--transition-normal);
}

.transition-colors {
  transition-property: color, background-color, border-color, text-decoration-color, fill, stroke;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: var(--transition-normal);
}

.transition-opacity {
  transition-property: opacity;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: var(--transition-normal);
}

.transition-transform {
  transition-property: transform;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: var(--transition-normal);
}

.transition-shadow {
  transition-property: box-shadow;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: var(--transition-normal);
}

/* Transition Duration */
.duration-fast {
  transition-duration: var(--transition-fast);
}

.duration-normal {
  transition-duration: var(--transition-normal);
}

.duration-slow {
  transition-duration: var(--transition-slow);
}

/* Transition Timing Functions */
.ease-linear {
  transition-timing-function: linear;
}

.ease-in {
  transition-timing-function: cubic-bezier(0.4, 0, 1, 1);
}

.ease-out {
  transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
}

.ease-in-out {
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}

/* Transform Utilities */
.scale-0 { transform: scale(0); }
.scale-50 { transform: scale(0.5); }
.scale-75 { transform: scale(0.75); }
.scale-90 { transform: scale(0.9); }
.scale-95 { transform: scale(0.95); }
.scale-100 { transform: scale(1); }
.scale-105 { transform: scale(1.05); }
.scale-110 { transform: scale(1.1); }
.scale-125 { transform: scale(1.25); }
.scale-150 { transform: scale(1.5); }

.rotate-0 { transform: rotate(0deg); }
.rotate-45 { transform: rotate(45deg); }
.rotate-90 { transform: rotate(90deg); }
.rotate-180 { transform: rotate(180deg); }
.-rotate-45 { transform: rotate(-45deg); }
.-rotate-90 { transform: rotate(-90deg); }
.-rotate-180 { transform: rotate(-180deg); }

.translate-x-0 { transform: translateX(0); }
.translate-y-0 { transform: translateY(0); }
.translate-x-full { transform: translateX(100%); }
.translate-y-full { transform: translateY(100%); }
.-translate-x-full { transform: translateX(-100%); }
.-translate-y-full { transform: translateY(-100%); }

/* Transform Origin */
.origin-center { transform-origin: center; }
.origin-top { transform-origin: top; }
.origin-bottom { transform-origin: bottom; }
.origin-left { transform-origin: left; }
.origin-right { transform-origin: right; }

/* Loading States */
.loading {
  position: relative;
  cursor: wait;
}

.loading::after {
  content: '';
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid transparent;
  border-top-color: var(--grad-primary-start);
  border-right-color: var(--grad-primary-end);
  border-radius: var(--radius-full);
  animation: spin 1s linear infinite;
}

/* Skeleton Loading */
.skeleton {
  background: linear-gradient(
    90deg,
    var(--vscode-editor-background) 25%,
    color-mix(in srgb, var(--vscode-editor-foreground) 5%, var(--vscode-editor-background)) 50%,
    var(--vscode-editor-background) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

/* Hover Effects */
.hover-lift:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.hover-glow:hover {
  box-shadow: 0 0 20px color-mix(in srgb, var(--grad-primary-start) 30%, transparent);
}

.hover-scale:hover {
  transform: scale(1.05);
}

/* Active Effects */
.active-scale:active {
  transform: scale(0.95);
}

.active-press:active {
  transform: translateY(1px);
}
`;