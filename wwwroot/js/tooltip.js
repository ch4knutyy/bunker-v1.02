/**
 * Tooltip functionality for player characteristics
 * Знак оклику з підказкою для характеристик гравця
 */

(function() {
    'use strict';

    // Ініціалізація tooltip при завантаженні DOM
    document.addEventListener('DOMContentLoaded', function() {
        initTooltips();
    });

    // Повторна ініціалізація після оновлення DOM (наприклад, через SignalR)
    window.reinitTooltips = function() {
        initTooltips();
    };

    function initTooltips() {
        const tooltipTriggers = document.querySelectorAll('.tooltip-trigger');
        
        tooltipTriggers.forEach(trigger => {
            // Видаляємо старі обробники
            trigger.removeEventListener('mouseenter', showTooltip);
            trigger.removeEventListener('mouseleave', hideTooltip);
            trigger.removeEventListener('touchstart', toggleTooltip);
            
            // Додаємо нові обробники
            trigger.addEventListener('mouseenter', showTooltip);
            trigger.addEventListener('mouseleave', hideTooltip);
            
            // Підтримка тач-пристроїв
            trigger.addEventListener('touchstart', toggleTooltip);
        });

        // Закриття tooltip при кліку поза ним (для мобільних)
        document.addEventListener('touchstart', function(e) {
            if (!e.target.closest('.characteristic-with-tooltip')) {
                hideAllTooltips();
            }
        });
    }

    function showTooltip(e) {
        const trigger = e.currentTarget;
        const tooltip = trigger.nextElementSibling;
        
        if (tooltip && tooltip.classList.contains('tooltip-content')) {
            // Позиціонування tooltip
            positionTooltip(trigger, tooltip);
            
            tooltip.style.opacity = '1';
            tooltip.style.visibility = 'visible';
        }
    }

    function hideTooltip(e) {
        const trigger = e.currentTarget;
        const tooltip = trigger.nextElementSibling;
        
        if (tooltip && tooltip.classList.contains('tooltip-content')) {
            tooltip.style.opacity = '0';
            tooltip.style.visibility = 'hidden';
        }
    }

    function toggleTooltip(e) {
        e.preventDefault();
        const trigger = e.currentTarget;
        const tooltip = trigger.nextElementSibling;
        
        if (tooltip && tooltip.classList.contains('tooltip-content')) {
            const isVisible = tooltip.style.visibility === 'visible';
            
            // Ховаємо всі інші tooltip
            hideAllTooltips();
            
            if (!isVisible) {
                positionTooltip(trigger, tooltip);
                tooltip.style.opacity = '1';
                tooltip.style.visibility = 'visible';
            }
        }
    }

    function hideAllTooltips() {
        document.querySelectorAll('.tooltip-content').forEach(tooltip => {
            tooltip.style.opacity = '0';
            tooltip.style.visibility = 'hidden';
        });
    }

    function positionTooltip(trigger, tooltip) {
        const triggerRect = trigger.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        
        // Перевіряємо чи tooltip виходить за межі екрану зверху
        if (triggerRect.top - tooltipRect.height - 10 < 0) {
            // Показуємо знизу
            tooltip.classList.add('bottom');
            tooltip.classList.remove('right');
        } 
        // Перевіряємо чи виходить за праву межу
        else if (triggerRect.left + tooltipRect.width / 2 > window.innerWidth) {
            tooltip.classList.add('right');
            tooltip.classList.remove('bottom');
        }
        else {
            tooltip.classList.remove('bottom', 'right');
        }
    }
})();
