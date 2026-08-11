import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Conditional classes with later Tailwind utilities winning over earlier ones.
 *
 * The merge matters for the primitives: a variant sets `px-3`, a caller passes `px-0`, and
 * without it both land in the class list and the cascade decides by stylesheet order
 * rather than by intent.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
