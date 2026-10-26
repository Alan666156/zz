package com.zz.babyfeeding.baby.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDate;

/**
 * PATCH body that distinguishes "absent" from "explicit null" so required
 * fields cannot be nulled out (contract 4.5). Jackson calls a setter for every
 * property present in the JSON, including null values.
 */
public class PatchBabyRequest {

    private Integer baseRevision;
    private String name;
    private String gender;
    private LocalDate birthDate;
    private Boolean isDefault;

    private boolean namePresent;
    private boolean genderPresent;
    private boolean birthDatePresent;
    private boolean isDefaultPresent;

    public Integer getBaseRevision() {
        return baseRevision;
    }

    public void setBaseRevision(Integer baseRevision) {
        this.baseRevision = baseRevision;
    }

    public String getName() {
        return name;
    }

    @JsonProperty("name")
    public void setName(String name) {
        this.namePresent = true;
        this.name = name;
    }

    public String getGender() {
        return gender;
    }

    @JsonProperty("gender")
    public void setGender(String gender) {
        this.genderPresent = true;
        this.gender = gender;
    }

    public LocalDate getBirthDate() {
        return birthDate;
    }

    @JsonProperty("birthDate")
    public void setBirthDate(LocalDate birthDate) {
        this.birthDatePresent = true;
        this.birthDate = birthDate;
    }

    @JsonIgnore
    public boolean isNamePresent() {
        return namePresent;
    }

    @JsonIgnore
    public boolean isGenderPresent() {
        return genderPresent;
    }

    @JsonIgnore
    public boolean isBirthDatePresent() {
        return birthDatePresent;
    }

    public Boolean getIsDefault() {
        return isDefault;
    }

    @JsonProperty("isDefault")
    public void setIsDefault(Boolean isDefault) {
        this.isDefaultPresent = true;
        this.isDefault = isDefault;
    }

    @JsonIgnore
    public boolean isDefaultPresent() {
        return isDefaultPresent;
    }
}
