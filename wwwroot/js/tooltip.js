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

    document.addEventListener("DOMContentLoaded", function () {
        console.log("[Tooltip] Initializing global card tooltip");

        let tooltip = document.getElementById("globalCardTooltip");

        if (!tooltip) {
            tooltip = document.createElement("div");
            tooltip.id = "globalCardTooltip";
            tooltip.className = "global-card-tooltip";
            document.body.appendChild(tooltip);
            console.log("[Tooltip] globalCardTooltip created dynamically");
        } else {
            console.log("[Tooltip] globalCardTooltip found in DOM");
        }

        document.addEventListener("mouseover", function (e) {
            const target = e.target.closest(".card-tooltip-wrapper");
            if (!target) return;

            const text = target.getAttribute("data-tooltip");
            console.log("[Tooltip] mouseover target:", target);
            console.log("[Tooltip] tooltip text:", text);

            if (!text) return;

            tooltip.textContent = text;
            tooltip.classList.add("show");

            positionTooltip(target);
        });

        document.addEventListener("mousemove", function (e) {
            const target = e.target.closest(".card-tooltip-wrapper");
            if (!target) return;

            positionTooltip(target);
        });

        document.addEventListener("mouseout", function (e) {
            const target = e.target.closest(".card-tooltip-wrapper");
            if (!target) return;

            tooltip.classList.remove("show");
        });

        function positionTooltip(target) {
            const rect = target.getBoundingClientRect();

            const tooltipWidth = tooltip.offsetWidth || 260;
            const tooltipHeight = tooltip.offsetHeight || 80;

            let left = rect.left + rect.width / 2;
            let top = rect.top - 12;

            // не дати вилізти за лівий/правий край
            const minLeft = tooltipWidth / 2 + 8;
            const maxLeft = window.innerWidth - tooltipWidth / 2 - 8;
            left = Math.max(minLeft, Math.min(left, maxLeft));

            // якщо зверху не влазить — показати знизу
            if (rect.top - tooltipHeight - 20 < 0) {
                tooltip.style.transform = "translate(-50%, 0)";
                tooltip.style.top = rect.bottom + 12 + "px";
            } else {
                tooltip.style.transform = "translate(-50%, -100%)";
                tooltip.style.top = top + "px";
            }

            tooltip.style.left = left + "px";

            console.log("[Tooltip] positioned:", {
                left: tooltip.style.left,
                top: tooltip.style.top,
                transform: tooltip.style.transform
            });
        }
    });
})();
