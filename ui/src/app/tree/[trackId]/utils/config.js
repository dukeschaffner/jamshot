export const MAX_NODES_PER_LEVEL = 11;
export const MAX_VISIBLE_NODES = 50;
export const MAX_LEVELS = 5;

export const BASE_NODE_SIZE = 70;
export const BASE_CLUSTER_NODE_SIZE = 45;

export const PRUNING_METHODS = {
    MAX_1_EXPANDED_PER_LEVEl: 0, // ensure only 1 node is expanded per level
    TOTAL_NODES_EXCEEDED: 1, // ensure total nodes does not exceed MAX_VISIBLE_NODES. Pruning starts when total nodes exceeds MAX_VISIBLE_NODES.
}

export const PRUNING_METHOD = PRUNING_METHODS.TOTAL_NODES_EXCEEDED;


export const RADIAL_TREE_CONFIG = {
    CHILDREN_LIMIT: 11,
    RING_SPACING: 300,
    RING_SIZE_FACTOR: 0.35,
};

export const CONCENTRIC_CONFIG = {
    BASE_RING_SIZE: 350,
    RING_SPACING: 75,
    OUTER_RING_RADIUS: 350,
    CHILDREN_LIMIT: 11,
    /** Extra radians of overscroll / empty arc past the oldest pagination edge only. */
    BOUNDARY_SCROLL_PADDING_RAD: Math.PI / 2,
};

export const DEBUG_MODE = false;