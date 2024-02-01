import { Engine, Render, Bodies, World, Runner, Body, Events, Vector } from 'matter-js';

class Simulation {
  engine: Engine;
  render: Render;
  scale: number;
  circleSize: number;

  constructor(elementId: string) {
    this.scale = 2;
    this.circleSize = 5 * this.scale;

    // Create an engine
    this.engine = Engine.create();
    this.engine.gravity.y = 0; // Reduce or eliminate gravity
    this.engine.timing.timeScale = 0.6; // Slow down time, 0.5 is half the normal speed

    // Create a renderer
    const canvasElement = document.getElementById(elementId)!;
    this.render = Render.create({
      element: canvasElement,
      engine: this.engine,
      options: {
        width: window.innerWidth,
        height: window.innerHeight,
        wireframes: false
      }
    });

    // Additional setup...
    this.applyCircularCurrent();
    this.addBodies();
    this.manageBodyDynamics();
    this.manageBodyShape();
    Runner.run(this.engine);
    Render.run(this.render);

    // Handle window resize
    window.addEventListener('resize', () => this.handleResize());
  }

  handleResize() {
    // Update the render dimensions to match the window size
    this.render.canvas.width = window.innerWidth;
    this.render.canvas.height = window.innerHeight;
    this.render.options.width = window.innerWidth;
    this.render.options.height = window.innerHeight;

    // Update the engine bounds
    this.engine.world.bounds.max.x = window.innerWidth;
    this.engine.world.bounds.max.y = window.innerHeight;

    // Center the view (optional)
    Render.lookAt(this.render, {
      min: { x: 0, y: 0 },
      max: { x: window.innerWidth, y: window.innerHeight }
    });
  }

  applyCircularCurrent() {
    const currentStrength = 0.0005; // Adjust this value to control the strength of the current

    Events.on(this.engine, 'beforeUpdate', () => {
      this.engine.world.bodies.forEach(body => {
        if (!body.isStatic) {
          // Calculate the vector from the body to the center of the canvas
          const toCenter = Vector.sub({ x: this.render.canvas.width / 2, y: this.render.canvas.height / 2 }, body.position);

          // Calculate a perpendicular vector to create a circular motion (counter-clockwise)
          const perpendicular = Vector.perp(toCenter);
          const normalized = Vector.normalise(perpendicular);

          // Apply the force to induce circular motion
          Body.applyForce(body, body.position, Vector.mult(normalized, currentStrength));
        }
      });
    });
  }

  addBodies() {
    const bodies: Body[] = []; // All bodies, both static and dynamic
    const centerX = this.render.canvas.width / 2;
    const centerY = this.render.canvas.height / 2;
    const size = this.circleSize;
    const layerDistance = 7 * size;

    let layer = 0;
    while (bodies.length < 60) { // Adjust for a complete hexagonal pattern
      const bodiesInLayer = layer === 0 ? 1 : 6 * layer;
      const angleStep = Math.PI * 2 / bodiesInLayer;

      for (let i = 0; i < bodiesInLayer; i++) {
        const angle = angleStep * i;
        const x = centerX + (layerDistance * layer) * Math.cos(angle);
        const y = centerY + (layerDistance * layer) * Math.sin(angle);

        const circle = Bodies.circle(x, y, size, {
          angle: angle + Math.PI / 2
        });

        this.setBodyStatic(circle);

        World.add(this.engine.world, circle);
        bodies.push(circle); // Add to bodies array
      }

      layer++;
    }

    setInterval(() => {
      const body = bodies.shift()!;
      this.toggleBody(body);
      bodies.push(body);
    }, 100 / this.engine.timing.timeScale);
  }

  toggleBody(body: Body) {
    if (body.isStatic) {
      this.setBodyDynamic(body);
    } else {
      this.setBodyStatic(body);
    }
  }

  setBodyDynamic(body: Body) {
    body.render.fillStyle = '#F35';
    body.render.lineWidth = 0;
    body.render.opacity = 1;
    Body.setStatic(body, false);
  }

  setBodyStatic(body: Body) {
    body.render.fillStyle = 'transparent';
    body.render.strokeStyle = '#aaa';
    body.render.lineWidth = (2 * this.scale);
    body.render.opacity = 1;
    Body.setStatic(body, true);
  }

  manageBodyDynamics() {
    const minDistance = this.circleSize * 10; // Minimum distance for breathing room
    const maxSpeed = 5; // Maximum speed a body can have
    const minSpeed = 1; // Minimum speed to ensure bodies are always moving
    const boundaryMargin = (10 * this.scale); // Distance from the edge within which bodies start turning back

    Events.on(this.engine, 'beforeUpdate', () => {
      const { world } = this.engine;

      world.bodies.forEach(body => {
        if (body.isStatic) return;

        let force = { x: 0, y: 0 };

        // Calculate repulsion from nearby bodies for breathing room
        const repulsion = this.calculateRepulsion(body, minDistance);
        force = Vector.add(force, repulsion);

        // If the body is not too close to others, apply steering direction
        if (Vector.magnitude(repulsion) < 0.01) {
          const steeringDirection = this.calculateSteeringDirection(body);
          force = Vector.add(force, steeringDirection);
        }

        // Check for boundaries and steer back if necessary
        force = this.checkForBoundaries(body, force, this.render.canvas.width, this.render.canvas.height, boundaryMargin);

        // Apply the force as acceleration
        Body.applyForce(body, body.position, { x: force.x * 0.001, y: force.y * 0.001 });

        // Enforce velocity envelope
        const currentSpeed = Vector.magnitude(body.velocity);
        if (currentSpeed > maxSpeed) {
          const scaledVelocity = Vector.normalise(body.velocity);
          Body.setVelocity(body, { x: scaledVelocity.x * maxSpeed, y: scaledVelocity.y * maxSpeed });
        } else if (currentSpeed < minSpeed) {
          const scaledVelocity = Vector.normalise(body.velocity);
          Body.setVelocity(body, { x: scaledVelocity.x * minSpeed, y: scaledVelocity.y * minSpeed });
        }

        // Update orientation based on velocity
        Body.setAngle(body, Math.atan2(body.velocity.y, body.velocity.x));
      });
    });
  }

  manageBodyShape() {
    Events.on(this.engine, 'beforeUpdate', () => {
      this.engine.world.bodies.forEach(body => {
        body.render.visible = body.isStatic;
      });
    });

    Events.on(this.render, 'afterRender', (event) => {
      const { context } = this.render;
      this.engine.world.bodies.forEach(body => {
        if (!body.isStatic && !body.render.visible) {
          // Custom rendering logic for bodies with default rendering disabled
          const speed = Vector.magnitude(body.velocity);
          const maxSpeed = 20; // Adjust as necessary
          const elongationFactor = Math.min(speed / maxSpeed, 1);

          const length = this.circleSize + (this.circleSize * elongationFactor * 0.8);
          const width = this.circleSize * (1 - (elongationFactor * 0.5));

          context.save();
          context.translate(body.position.x, body.position.y);
          context.rotate(Math.atan2(body.velocity.y, body.velocity.x));
          context.scale(length / this.circleSize, width / this.circleSize);

          context.beginPath();
          context.arc(0, 0, this.circleSize, 0, 2 * Math.PI);
          context.fillStyle = body.render.fillStyle || '#F35'; // Ensure visibility
          context.fill();

          context.restore();

          // Re-enable default rendering for the next frame or other contexts
          body.render.visible = true;
        }
      });
    });
  }

  checkForBoundaries(body: Body, force: Vector, canvasWidth: number, canvasHeight: number, boundaryMargin: number): Vector {
    const correctedForce = { ...force };

    if (body.position.x < boundaryMargin) {
      correctedForce.x += 1; // Steer right
    } else if (body.position.x > canvasWidth - boundaryMargin) {
      correctedForce.x -= 1; // Steer left
    }

    if (body.position.y < boundaryMargin) {
      correctedForce.y += 1; // Steer down
    } else if (body.position.y > canvasHeight - boundaryMargin) {
      correctedForce.y -= 1; // Steer up
    }

    const forceMultiplier = 1;
    correctedForce.x *= forceMultiplier;
    correctedForce.y *= forceMultiplier;

    return correctedForce;
  }

  calculateRepulsion(body: Body, minDistance: number) {
    let repulsion = { x: 0, y: 0 };

    this.engine.world.bodies.forEach(other => {
      if (body !== other && !other.isStatic) {
        const distanceVector = Vector.sub(body.position, other.position);
        const distanceMagnitude = Vector.magnitude(distanceVector);

        // Approach 1: Decrease the minimum distance to start repulsion from further away
        // You can adjust this value to find a suitable distance for your simulation
        const effectiveMinDistance = minDistance * 0.8; // For example, 80% of the original minDistance

        if (distanceMagnitude < effectiveMinDistance && distanceMagnitude > 0) {
          // Approach 2: Increase the magnitude of the repulsion force
          // This makes the repulsion effect stronger when bodies are within the effectiveMinDistance
          const repelForceMagnitude = 1 / (distanceMagnitude * distanceMagnitude);
          const repelForce = Vector.mult(Vector.normalise(distanceVector), repelForceMagnitude * 100); // Increase the multiplier to strengthen the force

          repulsion = Vector.add(repulsion, repelForce);
        }
      }
    });

    return repulsion;
  }

  calculateSteeringDirection(body: Body) {
    const currentDirection: Vector = { x: Math.cos(body.angle), y: Math.sin(body.angle) };
    const fieldOfView = Math.PI * 0.75; // lil less than 180 degrees
    const visibleBodies = this.getVisibleBodies(body, fieldOfView);

    if (visibleBodies.length === 0) {
      return currentDirection; // Maintain current direction if no visible bodies
    }

    // B1: Nearest visible body to B0
    const B1 = visibleBodies[0];

    // B2: Nearest neighbor to B1 that is visible to B0 and not occluded by B1
    const B2 = this.getNonOccludedNeighbor(B1, visibleBodies, body);

    if (!B2) {
      // If there's no B2, maintain current direction
      // return this.steerTowards(body, B1.position);
      return currentDirection;
    }

    // Steer towards midpoint between B1 and B2
    const midpoint = { x: (B1.position.x + B2.position.x) / 2, y: (B1.position.y + B2.position.y) / 2 };
    return this.steerTowards(body, midpoint);
  }

  getVisibleBodies(body: Body, fieldOfView: number) {
    return this.engine.world.bodies.filter(other => {
      if (other === body || other.isStatic) return false;

      const toOther = Vector.sub(other.position, body.position);
      const bodyDirection = Vector.create(Math.cos(body.angle), Math.sin(body.angle));

      const angleToOther = Vector.angle(bodyDirection, toOther);

      // Check if within field of view
      return angleToOther <= fieldOfView / 2;
    }).sort((a, b) => {
      // Sort by distance to B0
      const distanceA = Vector.magnitude(Vector.sub(body.position, a.position));
      const distanceB = Vector.magnitude(Vector.sub(body.position, b.position));
      return distanceA - distanceB;
    });
  }

  getNonOccludedNeighbor(B1: Body, visibleBodies: Body[], B0: Body) {
    for (let B2 of visibleBodies) {
      if (B2 === B1) continue; // Skip B1 itself

      // Check if B1 occludes B2 from B0's perspective
      if (!this.isOccluded(B0, B1, B2)) {
        return B2; // B2 is visible and not occluded by B1
      }
    }
    return null; // No non-occluded B2 found
  }

  isOccluded(B0: Body, B1: Body, B2: Body) {
    // Vector from B0 to B1
    const vectorB0B1 = Vector.sub(B1.position, B0.position);
    const normalizedB0B1 = Vector.normalise(vectorB0B1);

    // Vector from B0 to B2
    const vectorB0B2 = Vector.sub(B2.position, B0.position);
    const normalizedB0B2 = Vector.normalise(vectorB0B2);

    // Calculate the dot product of the normalized vectors
    const dotProduct = Vector.dot(normalizedB0B1, normalizedB0B2);

    // Calculate the angle in degrees between the vectors
    const angleBetween = Math.acos(dotProduct) * (180 / Math.PI);

    // If the angle is less than 15 degrees, consider B2 occluded by B1
    return angleBetween < 5;
  }

  steerTowards(body: Body, target: Vector) {
    const desiredDirection = Vector.sub(target, body.position);
    const normalizedDesiredDirection = Vector.normalise(desiredDirection);
    return normalizedDesiredDirection; // This vector can be scaled as needed
  }
}

// When the page is fully loaded, start the simulation
window.addEventListener('load', () => {
  new Simulation('simulationCanvas');
});
