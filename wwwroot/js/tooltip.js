(function () {
    'use strict';

    let portal = null;
    let activeTrigger = null;
    let focusOpenedAt = 0;

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
        const margin = 12;
        const viewportPadding = 12;
        const width = Math.min(target.offsetWidth, window.innerWidth - viewportPadding * 2);
        const height = target.offsetHeight;
        let left = rect.left + rect.width / 2 - width / 2;
        left = Math.max(viewportPadding, Math.min(left, window.innerWidth - width - viewportPadding));
        let top = rect.top - height - margin;
        if (top < viewportPadding) top = Math.min(window.innerHeight - height - viewportPadding, rect.bottom + margin);
        target.style.left = `${Math.round(left)}px`;
        target.style.top = `${Math.max(viewportPadding, Math.round(top))}px`;
    }

    function show(trigger) {
        const content = getContent(trigger);
        if (!content || !content.textContent.trim()) return;
        const target = ensurePortal();
        target.innerHTML = content.innerHTML;
        target.hidden = false;
        activeTrigger?.classList.remove('active');
        activeTrigger = trigger;
        activeTrigger.classList.add('active');
        activeTrigger.setAttribute('aria-expanded', 'true');
        positionPortal(trigger);
    }

    function hide(trigger = activeTrigger) {
        if (trigger && trigger !== activeTrigger) return;
        activeTrigger?.classList.remove('active');
        activeTrigger?.setAttribute('aria-expanded', 'false');
        activeTrigger = null;
        if (portal) {
            portal.hidden = true;
            portal.replaceChildren();
        }
    }

    function triggerFromEvent(event) {
        return event.target.closest?.('.tooltip-trigger') || null;
    }

    document.addEventListener('pointerover', event => {
        const trigger = triggerFromEvent(event);
        if (trigger && event.pointerType !== 'touch') show(trigger);
    });
    document.addEventListener('pointerout', event => {
        const trigger = triggerFromEvent(event);
        if (trigger && event.pointerType !== 'touch' && !trigger.contains(event.relatedTarget)) hide(trigger);
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
