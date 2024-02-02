import { Engine, Render, Bodies, World, Runner, Body, Events, Vector, Query } from 'matter-js';

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
    const maxSpeed = 5; // Maximum speed a body can have
    const minSpeed = 0.1; // Minimum speed to ensure bodies are always moving

    Events.on(this.engine, 'beforeUpdate', () => {
      const { world } = this.engine;

      world.bodies.forEach((body, index) => {
        if (body.isStatic) return;

        const currentForce = Vector.mult(this.getCurrentForce(body), 0.1);
        const boundaryForce = Vector.mult(this.getEdgeRepulsionForce(body), 10);
        const socialForce = Vector.mult(this.getSocialForce(body, 20), 20);
        const antiSocialForce = Vector.mult(this.antiSocialForce(body), 1);

        const netForce = Vector.add(
          currentForce,
          Vector.add(
            antiSocialForce,
            Vector.add(boundaryForce, socialForce)
          )
        );

        // Apply the force as adjusted acceleration
        Body.applyForce(body, body.position, { x: netForce.x * 0.001, y: netForce.y * 0.001 });

        // Enforce velocity envelope
        const currentSpeed = Vector.magnitude(body.velocity);
        if (currentSpeed > maxSpeed) {
          const scaledVelocity = Vector.normalise(body.velocity);
          Body.setVelocity(body, { x: scaledVelocity.x * maxSpeed, y: scaledVelocity.y * maxSpeed });
        } else if (currentSpeed < minSpeed) {
          const scaledVelocity = Vector.normalise(body.velocity);
          Body.setVelocity(body, { x: scaledVelocity.x * minSpeed, y: scaledVelocity.y * minSpeed });
        }
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

  getCurrentForce(body: Body) {
    // Calculate the vector from the body to the center of the canvas
    const toCenter = Vector.sub({ x: this.render.canvas.width / 2, y: this.render.canvas.height / 2 }, body.position);

    // Calculate a perpendicular vector to create a circular motion (counter-clockwise)
    const perpendicular = Vector.perp(toCenter);
    return Vector.normalise(perpendicular);
  }

  getEdgeRepulsionForce(body: Body) {
    const canvasWidth = this.render.canvas.width;
    const canvasHeight = this.render.canvas.height;
    const comfortableDistance = 100; // Distance from the edge where bodies start to feel "uncomfortable"
    const maxForce = 0.05; // Maximum repulsion force

    let forceX = 0;
    let forceY = 0;

    // Calculate distance to the nearest edge on the X axis
    const distanceToNearestEdgeX = Math.min(body.position.x, canvasWidth - body.position.x);
    // Calculate distance to the nearest edge on the Y axis
    const distanceToNearestEdgeY = Math.min(body.position.y, canvasHeight - body.position.y);

    // Calculate repulsion force on the X axis
    if (distanceToNearestEdgeX < comfortableDistance) {
      const intensityX = (comfortableDistance - distanceToNearestEdgeX) / comfortableDistance;
      forceX = (body.position.x < canvasWidth / 2 ? 1 : -1) * maxForce * intensityX ** 2; // Quadratic increase for stronger effect near edge
    }

    // Calculate repulsion force on the Y axis
    if (distanceToNearestEdgeY < comfortableDistance) {
      const intensityY = (comfortableDistance - distanceToNearestEdgeY) / comfortableDistance;
      forceY = (body.position.y < canvasHeight / 2 ? 1 : -1) * maxForce * intensityY ** 2; // Quadratic increase for stronger effect near edge
    }

    // Apply the repulsion force to the body
    return { x: forceX, y: forceY };
  }

  getSocialForce(body: Body, radius: number) {
    const fieldOfView = (180 * Math.PI) / 180; // Convert to radians
    const visibleBodies = this.getVisibleBodies(body, fieldOfView, radius);
    const minGap = (10 * Math.PI) / 180; // 10 degrees in radians

    if (visibleBodies.length === 0) {
      return { x: 0, y: 0 }; // No force if no visible bodies
    }

    let angles = visibleBodies.map(other => {
      const toOther = Vector.sub(other.position, body.position);
      return Math.atan2(toOther.y, toOther.x);
    }).sort((a, b) => a - b);

    angles.push(angles[0] + Math.PI * 2); // Include wrap-around angle

    let largestGap = 0;
    let gapMidpoint = 0;
    let gapRadius = 0;

    for (let i = 0; i < angles.length - 1; i++) {
      let gap = angles[i + 1] - angles[i];
      if (gap > largestGap && gap > minGap) {
        const midpointAngle = angles[i] + gap / 2;
        const distanceToNearestBody = this.getDistanceToNearestBody(body, midpointAngle, radius);

        // Half the distance to the nearest body in the direction of the gap midpoint will be the radius
        const circleRadius = distanceToNearestBody / 2;

        if (this.isCircleClear(body, midpointAngle, circleRadius, visibleBodies)) {
          largestGap = gap;
          gapMidpoint = midpointAngle;
          gapRadius = circleRadius;
        }
      }
    }

    if (largestGap > minGap && gapRadius > 0) {
      const desiredDirection = this.steerTowards(body, gapMidpoint);
      return Vector.mult(desiredDirection, 0.01); // Adjust magnitude of the force as needed
    }

    return { x: 0, y: 0 }; // No significant gap found, or the gap is not clear
  }

  getDistanceToNearestBody(body: Body, angle: number, searchRadius: number) {
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    let minDistance = searchRadius;

    this.engine.world.bodies.forEach(other => {
      if (other !== body && !other.isStatic) {
        const toOther = Vector.sub(other.position, body.position);
        const distance = Vector.magnitude(toOther);
        if (distance < minDistance) {
          const angleToOther = Math.atan2(toOther.y, toOther.x);
          if (Math.abs(angle - angleToOther) <= (10 * Math.PI) / 180) { // Check if within a 10-degree cone
            minDistance = distance;
          }
        }
      }
    });

    return minDistance;
  }

  isCircleClear(body: Body, angle: number, radius: number, visibleBodies: Body[]) {
    const circleCenter = Vector.add(body.position, Vector.mult({ x: Math.cos(angle), y: Math.sin(angle) }, radius));
    return !visibleBodies.some(other => {
      const distance = Vector.magnitude(Vector.sub(circleCenter, other.position));
      return distance < radius; // Check if any body is within the circle
    });
  }

  antiSocialForce(body: Body) {
    const personalSpaceRadius = 50 * this.scale; // The radius within which the body desires personal space
    const repulsionStrength = 0.05; // Adjust this value to control the strength of the repulsion force

    // Initialize a vector to accumulate all repulsion forces
    let repulsionForce: Vector = { x: 0, y: 0 };

    // Use Query.region to find bodies within the personal space radius
    const nearbyBodies = Query.region(this.engine.world.bodies, {
      min: { x: body.position.x - personalSpaceRadius, y: body.position.y - personalSpaceRadius },
      max: { x: body.position.x + personalSpaceRadius, y: body.position.y + personalSpaceRadius }
    });

    nearbyBodies.forEach(other => {
      if (other === body || other.isStatic) return; // Ignore the body itself and static bodies

      const distanceVector = Vector.sub(body.position, other.position);
      const distance = Vector.magnitude(distanceVector);

      // Only consider bodies within the personal space radius
      if (distance < personalSpaceRadius) {
        // Calculate a repulsion vector, inversely proportional to the square of the distance
        const normalizedDistanceVector = Vector.normalise(distanceVector);
        const repulsionMagnitude = repulsionStrength / Math.pow(distance / personalSpaceRadius, 2);
        const repulsion = Vector.mult(normalizedDistanceVector, repulsionMagnitude);

        // Accumulate the repulsion force
        repulsionForce = Vector.add(repulsionForce, repulsion);
      }
    });

    return repulsionForce;
  }

  getVisibleBodies(body: Body, fieldOfView: number, searchRadius: number) {
    // Define a bounding box around the body based on the search radius
    const boundingBox = {
      min: { x: body.position.x - searchRadius, y: body.position.y - searchRadius },
      max: { x: body.position.x + searchRadius, y: body.position.y + searchRadius }
    };

    // Use Query.region to get all bodies within the bounding box
    const bodiesInRegion = Query.region(this.engine.world.bodies, boundingBox);

    // Filter these bodies by actual distance and field of view
    return bodiesInRegion.filter(other => {
      if (other === body || other.isStatic) return false;

      const toOther = Vector.sub(other.position, body.position);
      const distance = Vector.magnitude(toOther);
      const bodyDirection = Vector.create(Math.cos(body.angle), Math.sin(body.angle));
      const angleToOther = Vector.angle(bodyDirection, toOther);

      // Check if within field of view and within the actual circular search radius
      return angleToOther <= fieldOfView / 2 && distance <= searchRadius;
    }).sort((a, b) => {
      // Sort by distance to the body of interest
      const distanceA = Vector.magnitude(Vector.sub(body.position, a.position));
      const distanceB = Vector.magnitude(Vector.sub(body.position, b.position));
      return distanceA - distanceB;
    });
  }

  steerTowards(body: Body, angle: number) {
    const desiredDirection = {
      x: Math.cos(angle),
      y: Math.sin(angle)
    };
    return desiredDirection; // This vector can be scaled as needed
  }
}

// When the page is fully loaded, start the simulation
window.addEventListener('load', () => {
  new Simulation('simulationCanvas');
});
