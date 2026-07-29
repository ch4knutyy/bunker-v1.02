(function () {
    'use strict';

    let portal = null;
    let activeTrigger = null;
    let focusOpenedAt = 0;
	let hideTimer = null;

    function ensurePortal() {
        if (portal?.isConnected) return portal;
        portal = document.createElement('div');
        portal.id = 'characteristicTooltipPortal';
        portal.className = 'tooltip-portal';
        portal.setAttribute('role', 'tooltip');
        portal.hidden = true;
        document.body.appendChild(portal);
        return portal;
    }

    function getContent(trigger) {
        const content = trigger?.nextElementSibling;
        return content?.classList.contains('tooltip-content') ? content : null;
    }

    function positionPortal(trigger) {
        const target = ensurePortal();
        const rect = trigger.getBoundingClientRect();
        const margin = 10;
        const viewportPadding = 12;
        const header = document.querySelector('.main-header');
        const headerBottom = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
        const safeTop = Math.min(window.innerHeight - viewportPadding, Math.max(viewportPadding, headerBottom + margin));
        const safeBottom = window.innerHeight - viewportPadding;
        target.style.maxHeight = `${Math.max(120, safeBottom - safeTop)}px`;
        const width = Math.min(target.offsetWidth, window.innerWidth - viewportPadding * 2);
        const height = target.offsetHeight;
        const canFitRight = rect.right + margin + width <= window.innerWidth - viewportPadding;
        const canFitLeft = rect.left - margin - width >= viewportPadding;
        const canFitAbove = rect.top - margin - height >= safeTop;
        const canFitBelow = rect.bottom + margin + height <= safeBottom;
        let placement = 'top';
        let left;
        let top;

        if (canFitRight) {
            placement = 'right';
            left = rect.right + margin;
            top = rect.top + rect.height / 2 - height / 2;
        } else if (canFitLeft) {
            placement = 'left';
            left = rect.left - margin - width;
            top = rect.top + rect.height / 2 - height / 2;
        } else if (canFitAbove || !canFitBelow) {
            placement = 'top';
            left = rect.left + rect.width / 2 - width / 2;
            top = rect.top - height - margin;
        } else {
            placement = 'bottom';
            left = rect.left + rect.width / 2 - width / 2;
            top = rect.bottom + margin;
        }

        left = Math.max(viewportPadding, Math.min(left, window.innerWidth - width - viewportPadding));
        top = Math.max(safeTop, Math.min(top, safeBottom - height));
        target.dataset.placement = placement;
        target.style.left = `${Math.round(left)}px`;
        target.style.top = `${Math.round(top)}px`;
    }

    function show(trigger) {
		if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        const content = getContent(trigger);
        if (!content || !content.textContent.trim()) return;
        const target = ensurePortal();
        target.innerHTML = content.innerHTML;
        target.classList.toggle('is-public-characteristic-tooltip', content.classList.contains('public-characteristic-tooltip-content'));
        target.classList.toggle('is-detailed-tooltip', content.classList.contains('is-detailed'));
        const accent = getComputedStyle(trigger).getPropertyValue('--public-characteristic-accent').trim();
        if (accent) target.style.setProperty('--public-characteristic-accent', accent);
        else target.style.removeProperty('--public-characteristic-accent');
        target.hidden = false;
        if (activeTrigger && activeTrigger !== trigger) {
            activeTrigger.classList.remove('active');
            activeTrigger.setAttribute('aria-expanded', 'false');
            activeTrigger.removeAttribute('aria-describedby');
        }
        activeTrigger = trigger;
        activeTrigger.classList.add('active');
        activeTrigger.setAttribute('aria-expanded', 'true');
        activeTrigger.setAttribute('aria-describedby', target.id);
        positionPortal(trigger);
        requestAnimationFrame(() => activeTrigger === trigger && positionPortal(trigger));
    }

    function hide(trigger = activeTrigger) {
        if (trigger && trigger !== activeTrigger) return;
		if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        activeTrigger?.classList.remove('active');
        activeTrigger?.setAttribute('aria-expanded', 'false');
        activeTrigger?.removeAttribute('aria-describedby');
        activeTrigger = null;
        if (portal) {
            portal.hidden = true;
            portal.replaceChildren();
            portal.classList.remove('is-public-characteristic-tooltip');
            portal.classList.remove('is-detailed-tooltip');
            delete portal.dataset.placement;
        }
    }

    function triggerFromEvent(event) {
        return event.target.closest?.('.tooltip-trigger') || null;
    }

	function scheduleHide(trigger) {
		if (trigger && trigger !== activeTrigger) return;
		if (hideTimer) clearTimeout(hideTimer);
		hideTimer = setTimeout(() => hide(trigger), 90);
	}

    document.addEventListener('pointerover', event => {
        const trigger = triggerFromEvent(event);
        if (trigger && event.pointerType !== 'touch') show(trigger);
    });
    document.addEventListener('pointerout', event => {
        const trigger = triggerFromEvent(event);
		if (trigger && event.pointerType !== 'touch' && event.relatedTarget !== portal && !portal?.contains(event.relatedTarget)) scheduleHide(trigger);
    });
    document.addEventListener('focusin', event => {
        const trigger = triggerFromEvent(event);
        if (trigger) {
            show(trigger);
            focusOpenedAt = Date.now();
        }
    });
    document.addEventListener('focusout', event => {
        const trigger = triggerFromEvent(event);
        if (trigger) hide(trigger);
    });
    document.addEventListener('click', event => {
        const trigger = triggerFromEvent(event);
        if (!trigger) {
            if (!event.target.closest?.('#characteristicTooltipPortal')) hide();
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (activeTrigger === trigger && Date.now() - focusOpenedAt >= 250) hide(trigger); else show(trigger);
        focusOpenedAt = 0;
    }, true);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') hide();
    });
	ensurePortal().addEventListener('pointerenter', () => {
		if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
	});
	ensurePortal().addEventListener('pointerleave', () => scheduleHide());
    window.addEventListener('resize', () => activeTrigger && positionPortal(activeTrigger));
    window.addEventListener('scroll', () => activeTrigger && positionPortal(activeTrigger), true);

    window.reinitTooltips = function () {
        ensurePortal();
        if (activeTrigger && !activeTrigger.isConnected) hide();
        document.querySelectorAll('.tooltip-trigger').forEach(trigger => {
            if (!trigger.hasAttribute('tabindex')) trigger.tabIndex = 0;
            if (!trigger.hasAttribute('role')) trigger.setAttribute('role', 'button');
            trigger.setAttribute('aria-expanded', trigger === activeTrigger ? 'true' : 'false');
        });
    };

    document.addEventListener('DOMContentLoaded', window.reinitTooltips);
})();
