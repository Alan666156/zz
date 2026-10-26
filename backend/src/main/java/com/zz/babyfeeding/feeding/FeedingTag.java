package com.zz.babyfeeding.feeding;

/**
 * Preset feeding tags. Declaration order is the API/CSV output order (Q-03).
 */
public enum FeedingTag {
    SPIT_UP("吐奶"),
    REFUSED("拒食"),
    SLEEPY("困倦"),
    HICCUP("打嗝"),
    OTHER("其他");

    private final String label;

    FeedingTag(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
