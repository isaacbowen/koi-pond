import { Engine, Render, Bodies, World, Runner } from 'matter-js';
class Simulation {
    constructor(elementId) {
        // Create an engine
        this.engine = Engine.create();
        // Create a renderer
        this.render = Render.create({
            element: document.getElementById(elementId),
            engine: this.engine,
            options: {
                width: 800,
                height: 600,
                wireframes: false
            }
        });
        // Add bodies to the world
        this.addBodies();
        // Run the engine
        Runner.run(this.engine);
        // Run the renderer
        Render.run(this.render);
    }
    addBodies() {
        // Add a ground
        const ground = Bodies.rectangle(400, 580, 810, 60, { isStatic: true });
        // Add some random bodies to simulate nodes
        for (let i = 0; i < 50; i++) {
            const x = Math.random() * 800;
            const circle = Bodies.circle(x, 0, 5);
            World.add(this.engine.world, circle);
        }
        World.add(this.engine.world, ground);
    }
}
// When the page is fully loaded, start the simulation
window.addEventListener('load', () => {
    new Simulation('simulationCanvas');
});
