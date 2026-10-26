package com.zz.babyfeeding.growth.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * PATCH body with presence flags: absent = unchanged, explicit null = clear an
 * optional metric. babyId is present only to reject it, mirroring Q-04.
 */
public class PatchGrowthRecordRequest {

    private Integer baseRevision;
    private String measuredOn;
    private JsonNode heightCm;
    private JsonNode weightKg;
    private JsonNode headCircumferenceCm;
    private String note;
    private JsonNode babyId;

    private boolean measuredOnPresent;
    private boolean heightCmPresent;
    private boolean weightKgPresent;
    private boolean headCircumferenceCmPresent;
    private boolean notePresent;
    private boolean babyIdPresent;

    public Integer getBaseRevision() {
        return baseRevision;
    }

    public void setBaseRevision(Integer baseRevision) {
        this.baseRevision = baseRevision;
    }

    public String getMeasuredOn() {
        return measuredOn;
    }

    @JsonProperty("measuredOn")
    public void setMeasuredOn(String measuredOn) {
        this.measuredOnPresent = true;
        this.measuredOn = measuredOn;
    }

    public JsonNode getHeightCm() {
        return heightCm;
    }

    @JsonProperty("heightCm")
    public void setHeightCm(JsonNode heightCm) {
        this.heightCmPresent = true;
        this.heightCm = heightCm;
    }

    public JsonNode getWeightKg() {
        return weightKg;
    }

    @JsonProperty("weightKg")
    public void setWeightKg(JsonNode weightKg) {
        this.weightKgPresent = true;
        this.weightKg = weightKg;
    }

    public JsonNode getHeadCircumferenceCm() {
        return headCircumferenceCm;
    }

    @JsonProperty("headCircumferenceCm")
    public void setHeadCircumferenceCm(JsonNode headCircumferenceCm) {
        this.headCircumferenceCmPresent = true;
        this.headCircumferenceCm = headCircumferenceCm;
    }

    public String getNote() {
        return note;
    }

    @JsonProperty("note")
    public void setNote(String note) {
        this.notePresent = true;
        this.note = note;
    }

    public JsonNode getBabyId() {
        return babyId;
    }

    @JsonProperty("babyId")
    public void setBabyId(JsonNode babyId) {
        this.babyIdPresent = true;
        this.babyId = babyId;
    }

    @JsonIgnore
    public boolean isMeasuredOnPresent() {
        return measuredOnPresent;
    }

    @JsonIgnore
    public boolean isHeightCmPresent() {
        return heightCmPresent;
    }

    @JsonIgnore
    public boolean isWeightKgPresent() {
        return weightKgPresent;
    }

    @JsonIgnore
    public boolean isHeadCircumferenceCmPresent() {
        return headCircumferenceCmPresent;
    }

    @JsonIgnore
    public boolean isNotePresent() {
        return notePresent;
    }

    @JsonIgnore
    public boolean isBabyIdPresent() {
        return babyIdPresent;
    }
}
