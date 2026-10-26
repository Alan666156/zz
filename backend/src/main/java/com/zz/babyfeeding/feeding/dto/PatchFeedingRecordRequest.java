package com.zz.babyfeeding.feeding.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;

/**
 * PATCH body with presence flags so "absent" (unchanged) can be told apart from
 * an explicit null (clear an optional field). babyId is deliberately included
 * only so its presence can be rejected (Q-04).
 */
public class PatchFeedingRecordRequest {

    private Integer baseRevision;
    private String feedType;
    private String breastSide;
    private JsonNode amountValue;
    private String amountUnit;
    private Integer durationSec;
    private String startedAt;
    private String endedAt;
    private String note;
    private List<String> tags;
    private JsonNode babyId;

    private boolean feedTypePresent;
    private boolean breastSidePresent;
    private boolean amountValuePresent;
    private boolean amountUnitPresent;
    private boolean durationSecPresent;
    private boolean startedAtPresent;
    private boolean endedAtPresent;
    private boolean notePresent;
    private boolean tagsPresent;
    private boolean babyIdPresent;

    public Integer getBaseRevision() {
        return baseRevision;
    }

    public void setBaseRevision(Integer baseRevision) {
        this.baseRevision = baseRevision;
    }

    public String getFeedType() {
        return feedType;
    }

    @JsonProperty("feedType")
    public void setFeedType(String feedType) {
        this.feedTypePresent = true;
        this.feedType = feedType;
    }

    public String getBreastSide() {
        return breastSide;
    }

    @JsonProperty("breastSide")
    public void setBreastSide(String breastSide) {
        this.breastSidePresent = true;
        this.breastSide = breastSide;
    }

    public JsonNode getAmountValue() {
        return amountValue;
    }

    @JsonProperty("amountValue")
    public void setAmountValue(JsonNode amountValue) {
        this.amountValuePresent = true;
        this.amountValue = amountValue;
    }

    public String getAmountUnit() {
        return amountUnit;
    }

    @JsonProperty("amountUnit")
    public void setAmountUnit(String amountUnit) {
        this.amountUnitPresent = true;
        this.amountUnit = amountUnit;
    }

    public Integer getDurationSec() {
        return durationSec;
    }

    @JsonProperty("durationSec")
    public void setDurationSec(Integer durationSec) {
        this.durationSecPresent = true;
        this.durationSec = durationSec;
    }

    public String getStartedAt() {
        return startedAt;
    }

    @JsonProperty("startedAt")
    public void setStartedAt(String startedAt) {
        this.startedAtPresent = true;
        this.startedAt = startedAt;
    }

    public String getEndedAt() {
        return endedAt;
    }

    @JsonProperty("endedAt")
    public void setEndedAt(String endedAt) {
        this.endedAtPresent = true;
        this.endedAt = endedAt;
    }

    public String getNote() {
        return note;
    }

    @JsonProperty("note")
    public void setNote(String note) {
        this.notePresent = true;
        this.note = note;
    }

    public List<String> getTags() {
        return tags;
    }

    @JsonProperty("tags")
    public void setTags(List<String> tags) {
        this.tagsPresent = true;
        this.tags = tags;
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
    public boolean isFeedTypePresent() {
        return feedTypePresent;
    }

    @JsonIgnore
    public boolean isBreastSidePresent() {
        return breastSidePresent;
    }

    @JsonIgnore
    public boolean isAmountValuePresent() {
        return amountValuePresent;
    }

    @JsonIgnore
    public boolean isAmountUnitPresent() {
        return amountUnitPresent;
    }

    @JsonIgnore
    public boolean isDurationSecPresent() {
        return durationSecPresent;
    }

    @JsonIgnore
    public boolean isStartedAtPresent() {
        return startedAtPresent;
    }

    @JsonIgnore
    public boolean isEndedAtPresent() {
        return endedAtPresent;
    }

    @JsonIgnore
    public boolean isNotePresent() {
        return notePresent;
    }

    @JsonIgnore
    public boolean isTagsPresent() {
        return tagsPresent;
    }

    @JsonIgnore
    public boolean isBabyIdPresent() {
        return babyIdPresent;
    }
}
