import { Engine, Render, Bodies, World, Runner, Body, Events, Vector, Query } from 'matter-js';

type BodyWithVisibleNeighbors = Body & { neighborsInView: Body[] };

class Simulation {
  engine: Engine;
  render: Render;
  geoScale: number;
  timeScale: number;
  circleSize: number;
  fieldOfViewDegrees: number;
  viewDistance: number;
  speedLimit: number;
  bodies: BodyWithVisibleNeighbors[];

  constructor(elementId: string) {
    this.geoScale = 2;
    this.timeScale = 0.2;
    this.speedLimit = 5;
    this.fieldOfViewDegrees = 270;
    this.viewDistance = 200 * this.geoScale;
    this.circleSize = 5 * this.geoScale;
    this.bodies = [];

    // Create an engine
    this.engine = Engine.create();
    this.engine.timing.timeScale = this.timeScale;
    this.engine.gravity.x = 0; // zero gravity
    this.engine.gravity.y = 0; // zero gravity

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
    const centerX = this.render.canvas.width / 2;
    const centerY = this.render.canvas.height / 2;
    const size = this.circleSize;
    const layerDistance = 7 * size;

    let layer = 0;
    while (this.bodies.length < 60) { // Adjust for a complete hexagonal pattern
      const bodiesInLayer = layer === 0 ? 1 : 6 * layer;
      const angleStep = Math.PI * 2 / bodiesInLayer;

      for (let i = 0; i < bodiesInLayer; i++) {
        const angle = angleStep * i;
        const x = centerX + (layerDistance * layer) * Math.cos(angle);
        const y = centerY + (layerDistance * layer) * Math.sin(angle);

        const body = Bodies.circle(x, y, size, {
          angle: angle + Math.PI / 2
        }) as BodyWithVisibleNeighbors;

        body.render.fillStyle = 'transparent';
        body.render.strokeStyle = '#aaa';
        body.render.lineWidth = (2 * this.geoScale);
        body.render.opacity = 1;
        Body.setStatic(body, true);

        World.add(this.engine.world, body);
        this.bodies.push(body); // Add to bodies array
      }

      layer++;
    }

    setInterval(() => {
      const body = this.bodies.shift()!;
      Body.setStatic(body, !body.isStatic);
      this.bodies.push(body);
    }, 100 / this.engine.timing.timeScale);
  }

  manageBodyDynamics() {
    Events.on(this.engine, 'beforeUpdate', () => {
      this.bodies.forEach((body) => {
        if (body.isStatic) return;

        // this gets used all over the place; calculate it once per update
        body.neighborsInView = this.getVisibleBodies(body);

        const forces: Vector[] = [];

        forces.push(Vector.mult(this.getCurrentForce(body), 2));
        forces.push(Vector.mult(this.getEdgeRepulsionForce(body, 100, 0.1), 5));
        forces.push(Vector.mult(this.getSocialForce(body, 20), 0.1));
        forces.push(Vector.mult(this.getAntiSocialForce(body, 50, 2), 1));

        const netForce = forces.reduce((acc, force) => Vector.add(acc, force), { x: 0, y: 0 });

        // Apply the force as adjusted acceleration
        Body.applyForce(body, body.position, { x: netForce.x * 0.001, y: netForce.y * 0.001 });

        // Enforce speed limit
        const currentSpeed = Vector.magnitude(body.velocity);
        if (currentSpeed > this.speedLimit) {
          const scaledVelocity = Vector.normalise(body.velocity);
          Body.setVelocity(body, { x: scaledVelocity.x * this.speedLimit, y: scaledVelocity.y * this.speedLimit });
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
        if (body.render.visible) return;

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
        context.fillStyle = '#F35';
        context.fill();

        context.restore();
      });
    });
  }

  getCurrentForce(body: Body) {
    // Calculate the vector from the body to the center of the canvas
    const toCenter = Vector.sub({ x: this.render.canvas.width / 2, y: this.render.canvas.height / 2 }, body.position);

    // Calculate the distance from the body to the center of the canvas
    const distanceToCenter = Vector.magnitude(toCenter);

    // Define a scaling factor based on the distance to the center
    // The maximum distance possible (diagonal of the canvas) will result in a scaling factor of 1 (full force)
    // The minimum distance possible (0) will result in a scaling factor of 0 (no force)
    const maxDistance = Math.sqrt(Math.pow(this.render.canvas.width / 2, 2) + Math.pow(this.render.canvas.height / 2, 2));
    const forceScale = distanceToCenter / maxDistance * 2;

    // Calculate a perpendicular vector to create a circular motion (counter-clockwise)
    const perpendicular = Vector.perp(toCenter);

    // Scale the force vector based on the distance to the center
    const scaledForce = Vector.mult(Vector.normalise(perpendicular), forceScale);

    return scaledForce;
  }

  getEdgeRepulsionForce(body: Body, radius: number, baseForce: number) {
    const scaledRadius = radius * this.geoScale;

    // Calculate distance to the nearest edge on the X and Y axes
    const distanceToNearestEdgeX = Math.min(body.position.x, this.render.canvas.width - body.position.x);
    const distanceToNearestEdgeY = Math.min(body.position.y, this.render.canvas.height - body.position.y);

    // Use the new helper method to calculate repulsion force
    const forceX = this.calculateRepulsionForce(distanceToNearestEdgeX, scaledRadius, baseForce) * (body.position.x < this.render.canvas.width / 2 ? 1 : -1);
    const forceY = this.calculateRepulsionForce(distanceToNearestEdgeY, scaledRadius, baseForce) * (body.position.y < this.render.canvas.height / 2 ? 1 : -1);

    return { x: forceX, y: forceY };
  }

  getSocialForce(body: BodyWithVisibleNeighbors, radius: number) {
    const scaledRadius = radius * this.geoScale;

    // aim for a gap of 10 degrees to 90 degrees
    const minGap = (10 * Math.PI) / 180;
    const maxGap = (90 * Math.PI) / 180;

    if (body.neighborsInView.length === 0) {
      return { x: 0, y: 0 }; // No force if no living neighbors
    }

    let angles = body.neighborsInView.map(other => {
      const toOther = Vector.sub(other.position, body.position);
      return Math.atan2(toOther.y, toOther.x);
    }).sort((a, b) => a - b);

    angles.push(angles[0] + Math.PI * 2); // Include wrap-around angle

    let largestGap = 0;
    let gapMidpoint = 0;
    let gapRadius = 0;

    for (let i = 0; i < angles.length - 1; i++) {
      let gap = angles[i + 1] - angles[i];
      if (gap > largestGap && gap > minGap && gap < maxGap) {
        const midpointAngle = angles[i] + gap / 2;
        const distanceToNearestBody = this.getDistanceToNearestBody(body, midpointAngle, scaledRadius);

        // Half the distance to the nearest body in the direction of the gap midpoint will be the radius
        const circleRadius = distanceToNearestBody / 2;

        if (this.isCircleClear(body, midpointAngle, circleRadius, body.neighborsInView)) {
          largestGap = gap;
          gapMidpoint = midpointAngle;
          gapRadius = circleRadius;
        }
      }
    }

    if (largestGap > minGap && gapRadius > 0) {
      return this.steerTowards(body, gapMidpoint);
    }

    return { x: 0, y: 0 }; // No significant gap found, or the gap is not clear
  }

  getDistanceToNearestBody(body: Body, angle: number, searchRadius: number) {
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

  getAntiSocialForce(body: BodyWithVisibleNeighbors, radius: number, baseForce: number) {
    const scaledRadius = radius * this.geoScale;
    const speedScalingFactor = Math.min(Math.max(Vector.magnitude(body.velocity), 1), 2); // Scale with speed, within bounds

    let repulsionForce: Vector = { x: 0, y: 0 };

    body.neighborsInView.forEach(other => {
      if (other === body) return;

      const distanceVector = Vector.sub(body.position, other.position);
      const distance = Vector.magnitude(distanceVector);

      if (distance < scaledRadius) {
        const repulsionMagnitude = this.calculateRepulsionForce(distance, scaledRadius, baseForce) * speedScalingFactor;
        const normalizedDistanceVector = Vector.normalise(distanceVector);
        const repulsion = Vector.mult(normalizedDistanceVector, repulsionMagnitude);

        repulsionForce = Vector.add(repulsionForce, repulsion);
      }
    });

    return repulsionForce;
  }

  getVisibleBodies(body: Body) {
    const fieldOfViewRadians = (this.fieldOfViewDegrees * Math.PI) / 180; // Convert degrees to radians
    const searchRadius = this.viewDistance;

    // Define a bounding box around the body based on the search radius
    const boundingBox = {
      min: { x: body.position.x - searchRadius, y: body.position.y - searchRadius },
      max: { x: body.position.x + searchRadius, y: body.position.y + searchRadius }
    };

    // Use Query.region to get all bodies within the bounding box
    const bodiesInRegion = Query.region(this.engine.world.bodies, boundingBox);

    // Filter these bodies by actual distance and field of view
    return bodiesInRegion.filter(other => {
      if (other === body) return false;

      const toOther = Vector.sub(other.position, body.position);
      const distance = Vector.magnitude(toOther);
      const bodyDirection = Vector.create(Math.cos(body.angle), Math.sin(body.angle));
      const angleToOther = Vector.angle(bodyDirection, toOther);

      // Check if within field of view and within the actual circular search radius
      return angleToOther <= fieldOfViewRadians / 2 && distance <= searchRadius;
    }).sort((a, b) => {
      // Sort by distance to the body of interest
      const distanceA = Vector.magnitude(Vector.sub(body.position, a.position));
      const distanceB = Vector.magnitude(Vector.sub(body.position, b.position));
      return distanceA - distanceB;
    });
  }

  steerTowards(body: Body, angle: number) {
    // Calculate a target point in the direction of the angle, at some distance away from the body
    const targetPointDistance = 100; // Arbitrary distance to define the target point
    const targetPoint = {
      x: body.position.x + Math.cos(angle) * targetPointDistance,
      y: body.position.y + Math.sin(angle) * targetPointDistance
    };

    // Calculate the vector from the body's current position to the target point
    const desiredDirection = Vector.sub(targetPoint, body.position);

    // Normalize the vector to get a unit vector in the desired direction
    return Vector.normalise(desiredDirection); // This vector can be scaled as needed
  }

  calculateRepulsionForce(currentDistance: number, comfortableDistance: number, baseForce: number) {
    if (currentDistance < comfortableDistance) {
      const intensity = (comfortableDistance - currentDistance) / comfortableDistance;
      return baseForce * intensity ** 2; // Quadratic increase for stronger effect near threshold
    }

    return 0;
  }
}

// When the page is fully loaded, start the simulation
window.addEventListener('load', () => {
  new Simulation('simulationCanvas');
});
