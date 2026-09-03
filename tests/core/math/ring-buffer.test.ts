import { describe, expect, it } from "vitest";
import { RingBuffer } from "../../../src/core/math/ring-buffer";

describe("RingBuffer", () => {
  it("drops the oldest items once capacity is exceeded", () => {
    const buf = new RingBuffer<number>(5);
    for (let i = 0; i < 8; i++) buf.push(i);
    expect(buf.toArray()).toEqual([3, 4, 5, 6, 7]);
  });

  it("never exceeds capacity", () => {
    const buf = new RingBuffer<number>(4);
    for (let i = 0; i < 20; i++) {
      buf.push(i);
      expect(buf.size).toBeLessThanOrEqual(4);
    }
    expect(buf.size).toBe(4);
  });

  it("clear empties the buffer", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.clear();
    expect(buf.size).toBe(0);
    expect(buf.toArray()).toEqual([]);
    expect(buf.last()).toBeUndefined();
  });

  it("reports capacity as a readonly property", () => {
    const buf = new RingBuffer<number>(7);
    expect(buf.capacity).toBe(7);
  });

  it("ageFraction is 0 for the oldest and 1 for the newest surviving item", () => {
    const buf = new RingBuffer<number>(4);
    for (let i = 0; i < 4; i++) buf.push(i);
    const fractions: number[] = [];
    buf.forEach((_item, ageFraction) => fractions.push(ageFraction));
    expect(fractions[0]).toBe(0);
    expect(fractions[fractions.length - 1]).toBe(1);
  });

  it("a single item has ageFraction 1", () => {
    const buf = new RingBuffer<number>(4);
    buf.push(42);
    const fractions: number[] = [];
    buf.forEach((_item, ageFraction) => fractions.push(ageFraction));
    expect(fractions).toEqual([1]);
  });

  it("toArray returns items oldest to newest after wraparound", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4);
    buf.push(5);
    expect(buf.toArray()).toEqual([3, 4, 5]);
  });

  it("last returns the most recently pushed item after wraparound", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4);
    expect(buf.last()).toBe(4);
  });

  it("forEach visits items in oldest-to-newest order with correct indices", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(10);
    buf.push(20);
    buf.push(30);
    buf.push(40);
    const seen: Array<{ item: number; index: number }> = [];
    buf.forEach((item, _age, index) => seen.push({ item, index }));
    expect(seen).toEqual([
      { item: 20, index: 0 },
      { item: 30, index: 1 },
      { item: 40, index: 2 },
    ]);
  });

  it("throws when constructed with capacity < 1", () => {
    expect(() => new RingBuffer<number>(0)).toThrow();
    expect(() => new RingBuffer<number>(-1)).toThrow();
  });
});
