document.addEventListener('DOMContentLoaded', function() {
    // Menu functionality
    const menuToggle = document.getElementById('menu-toggle');
    const menu = document.querySelector('.menu');
    const menuIcon = document.querySelector('.menu-icon i');
    
    // Close menu when clicking outside
    document.addEventListener('click', function(event) {
        if (!event.target.closest('.navbar') && menu.style.display === 'flex') {
            menuToggle.checked = false;
            menu.style.display = 'none';
            menuIcon.classList.remove('fa-times'); // Change to hamburger icon
            menuIcon.classList.add('fa-bars'); // Change to hamburger icon
        }
    });

    // Toggle menu on click
    menuToggle.addEventListener('change', function() {
        if (this.checked) {
            menu.style.display = 'flex'; // Show menu
            menuIcon.classList.remove('fa-bars'); // Change to cross icon
            menuIcon.classList.add('fa-times'); // Change to cross icon
        } else {
            menu.style.display = 'none'; // Hide menu
            menuIcon.classList.remove('fa-times'); // Change to hamburger icon
            menuIcon.classList.add('fa-bars'); // Change to hamburger icon
        }
    });

    // Smooth scroll for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            const headerOffset = 60;
            const elementPosition = target.offsetTop;
            const offsetPosition = elementPosition - headerOffset;

            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });

            // Close mobile menu after clicking
            if (window.innerWidth <= 768) {
                menuToggle.checked = false;
                menu.style.display = 'none';
                menuIcon.classList.remove('fa-times'); // Change to hamburger icon
                menuIcon.classList.add('fa-bars'); // Change to hamburger icon
            }
        });
    });

    // Star animation functionality
    const universe = document.getElementById("universe");
    if (universe) {
        const homeSection = document.getElementById("home");
        let stars = [];
        const starCount = Math.min(400, Math.floor((window.innerWidth * window.innerHeight) / 3000));
        
        // Function to create a single star
        function createStar() {
            const star = document.createElement("div");
            const size = Math.floor(Math.random() * 4);
            star.setAttribute("class", "star" + size);
            star.style.backgroundColor = "white";
            return star;
        }

        // Function to animate a single star
        function animateStar(star, width, height) {
            const ypos = Math.random() * height;
            const speed = 1000 * (Math.random() * 30 + 1);
            const animation = star.animate(
                [
                    {
                        transform: `translate3d(${width}px, ${ypos}px, 0)`
                    },
                    {
                        transform: `translate3d(-${Math.random() * width * 0.2}px, ${ypos}px, 0)`
                    }
                ],
                {
                    duration: speed,
                    iterations: Infinity,
                    delay: Math.random() * -speed
                }
            );
            return animation;
        }

        // Initialize stars
        function initStars() {
            // Clear existing stars
            universe.innerHTML = '';
            stars = [];

            const width = homeSection.offsetWidth;
            const height = homeSection.offsetHeight;
            
            // Create new stars based on screen size
            const currentStarCount = Math.min(400, Math.floor((width * height) / 3000));
            
            for (let i = 0; i < currentStarCount; i++) {
                const star = createStar();
                universe.appendChild(star);
                const animation = animateStar(star, width, height);
                stars.push({ element: star, animation: animation });
            }
        }

        // Initialize stars on load
        initStars();

        // Debounce function to limit resize events
        function debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }

        // Handle window resize with debouncing
        window.addEventListener('resize', debounce(() => {
            initStars();
        }, 150));

        // Handle visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                stars.forEach(star => star.animation.pause());
            } else {
                stars.forEach(star => star.animation.play());
            }
        });
    }

});