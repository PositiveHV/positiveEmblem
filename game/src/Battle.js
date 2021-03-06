import heroData from './heroInfo.json';
import {calculateCombatStats} from './StatCalculation.js'

import {applyCombatEffect, statusDebuffs, getEnemySide, checkConditionHero} from './GameBoard.js'



export function doBattle(updatedHeroList, attacker, defender, board){
    let list = updatedHeroList;

    let newAttacker = attacker;
    let newDefender = defender;

    //get specials
    let attackerSpecial = attacker.special;
    let defenderSpecial = defender.special;


    //after call combat buffs are calculated, recalculate their combat stats to use in damage calculation
    newAttacker.combatStats = calculateCombatStats(newAttacker, newDefender);
    newDefender.combatStats = calculateCombatStats(newDefender, newAttacker);

    //target def or res
    let attackerType = getDamageType(heroData[attacker.heroID.value].weapontype, attacker, defender);
    let defenderType = getDamageType(heroData[defender.heroID.value].weapontype, defender, attacker);
    //aDmgType = 

    //get the amount of attacks from each unit
    let attackCount = getAttackCount(attacker, defender);

    let attackStack = getAttackOrder(attackCount, attacker, defender);

    let attackerPartyBuff = {"atk": 0, "spd": 0, "def": 0, "res": 0};
    let defenderPartyBuff = {"atk": 0, "spd": 0, "def": 0, "res": 0};

    let attackerPartyHeal = 0;
    let defenderPartyHeal = 0;

    let attackerAttacked = false;
    let defenderAttacked = false;
    let attackerSpecialActivated = false;
    let defenderSpecialActivated = false;

    if (attacker.specialActivated){ //check if pre battle special was used
      attackerSpecialActivated = true;
    }

    //At this point, battle has started
    let attackIndex = 0;

    while (attackIndex < attackStack.length  && newAttacker.currentHP > 0 && newDefender.currentHP > 0){ //do attacks as long as the attack stack is not empty and both heroes are alive
      let temp = attackStack[attackIndex]; 
      let damageInfo = {};


      if (temp === 1){ //attacker hits defender
        damageInfo = calculateDamage(newAttacker, newDefender, attackerType, attackerSpecial, defenderSpecial, list, attackStack, attackIndex);

        attackerSpecial.charge = damageInfo.attackerSpecialCharge;

        defenderSpecial.charge =  damageInfo.defenderSpecialCharge;


        newDefender.currentHP = Math.max(0, newDefender.currentHP - damageInfo.damage);

        if (newAttacker.statusEffect.deepWounds < 1){
          newAttacker.currentHP = Math.min(newAttacker.stats.hp, newAttacker.currentHP + damageInfo.heal); //heal hp from attack
        }

        //the only reflecting special is currently ice mirror (range = 2), so can only be activated  by a melee defender (og fjorm) that is initated on  

        if (newDefender.combatEffects.reflect === 0){ //only get reflect damage if it is currently not set (so can't get overwritten from stuff like brave attacks)
          newDefender.combatEffects.reflect = damageInfo.reflect; 
        }


        if (newAttacker.combatEffects.reflect !== 0){ //The attacker has just attacked, so its reflect boost is now reset
          newAttacker.combatEffects.reflect = 0;
        }

        let buffs = damageInfo.partyBuff;
        Object.keys(buffs).forEach((key, i) => {
          attackerPartyBuff[key] = Math.max( attackerPartyBuff[key] ,buffs[key]); //apply highest buff
        });

        attackerPartyHeal = Math.max(damageInfo.partyHeal, attackerPartyHeal ); //take the higher heal so it doesn't get overwritten

        attackerAttacked = true;


        if (damageInfo.attackerSpecialActivated){
          attackerSpecialActivated = true;
        }

        if (damageInfo.defenderSpecialActivated){
          defenderSpecialActivated = true;
        }

      } else if (temp === 2){ //defender hits attacker

        //Note - CalculateDamage defines attacker as the one attacking, and defender as the one getting hit for the current attack, not by initiator/enemy phase heroes 
        damageInfo = calculateDamage(newDefender, newAttacker, defenderType, defenderSpecial, attackerSpecial, list, attackStack, attackIndex);

        defenderSpecial.charge = damageInfo.attackerSpecialCharge; //defender is iniated on, but uses attacker key since they are the one attacking here
        attackerSpecial.charge = damageInfo.defenderSpecialCharge;

        newAttacker.currentHP = Math.max(0, newAttacker.currentHP - damageInfo.damage);

        if (newDefender.statusEffect.deepWounds < 1){
          newDefender.currentHP = Math.min(newDefender.stats.hp, newDefender.currentHP + damageInfo.heal);
        }

        if (newAttacker.combatEffects.reflect === 0){ 
          newAttacker.combatEffects.reflect = damageInfo.reflect;
        }


        if (newDefender.combatEffects.reflect !== 0){ //The defender has just attacked, so its reflect is now reset
          newDefender.combatEffects.reflect = 0;
        }

        let buffs = damageInfo.partyBuff;
        Object.keys(buffs).forEach((key, i) => {
          defenderPartyBuff[key] = Math.max( defenderPartyBuff[key] ,buffs[key]); //apply highest buff
        });

        defenderPartyHeal = Math.max(damageInfo.partyHeal, defenderPartyHeal ); //take the higher heal 

        defenderAttacked = true;

        if (damageInfo.attackerSpecialActivated){
          defenderSpecialActivated = true;
        }

        if (damageInfo.defenderSpecialActivated){
          attackerSpecialActivated = true;
        }
      }

      attackIndex++;

    }

    //set new special charges before any post combat changes to it
    list[attacker.side][attacker.listIndex].special = attackerSpecial;
    list[defender.side][defender.listIndex].special = defenderSpecial;

    //combat has now ended, post combat effects activate

    //Deep wounds gets cleared post combat, but will still reduce healing effects before it is cleared
    let attackerWounds = attacker.statusEffect.deepWounds;
    let defenderWounds = defender.statusEffect.deepWounds;

    //First, the attacker needs to be waited and clear debuffs/status effects
    list[attacker.side][attacker.listIndex].debuff = {"atk": 0, "spd": 0, "def": 0, "res": 0};
    list[attacker.side][attacker.listIndex].statusEffect = statusDebuffs;
    list[attacker.side][attacker.listIndex].end = true;


    //Party buffs
    for (let x of list[attacker.side]){
      for (let key in attackerPartyBuff){
      //Object.keys(attackerPartyBuff).forEach((key, i) => {

        if (x.id !== attacker.saveID){ //saved ally does not get post combat effects
          x.buff[key] = Math.max(x.buff[key], attackerPartyBuff[key]);
        }
      }

    }

    for (let x of list[defender.side]){

      for (let key in defenderPartyBuff){
        
        if (x.id !== defender.saveID){
          x.buff[key] = Math.max(x.buff[key], defenderPartyBuff[key]);
        }
      }
    


    }




    //Apply battle-movement abilities
    //Check if attacker has a battle movement effect and both battlers are not saving someone currently (attacker can't really be saving currentlyit)
    if (Object.keys(attacker.battleMovement).length > 0  && !defender.saving && !attacker.saving){
      let participantIDs = [attacker.id, defender.id]; //their ids (to uniquely identify them)

      let newPositions =  calculateMovementEffect(attacker, defender, attacker.battleMovement);

      let attackerPos = newPositions.owner;
      let defenderPos = newPositions.other;
      


      //convert back to positions
      let newAttackerPos = rowColumnToPosition(newPositions.owner);
      let newDefenderPos = rowColumnToPosition(newPositions.other);


      if (checkValidMovement(attackerPos, defenderPos, [-1, -1], participantIDs, board)){ //no issues with given movement positions;
        list[attacker.side][attacker.listIndex].position = newAttackerPos;
        list[defender.side][defender.listIndex].position = newDefenderPos;
      }

    }




    //on attack combatEffects (strike effects) should just be recoil and stuff (and some debuff stuff)

    //stuff like recoil should wear off and this works fine - combat effects fine
    //buffs or status buffs need to be applied to the list version tho

    if (attackerAttacked){
        for (let effectElement of newAttacker.onAttack){ //loops through list of onAttack effects

          applyCombatEffect(newAttacker, effectElement);


        } //for m

    }

    if (defenderAttacked){
        for (let effectElement of newDefender.onAttack){

          applyCombatEffect(newDefender, effectElement);

        } //

    }


    //Post combat effects (requires owner to survive)
    if (newAttacker.currentHP > 0){
       for (let effectElement of newAttacker.postCombat){ //loop through post combat effects
          applyCombatEffect(newAttacker, effectElement);



       } //end for post combat

    }

    if (newDefender.currentHP > 0){

       for (let effectElement of newDefender.postCombat){ //loop through post combat effects
          applyCombatEffect(newDefender, effectElement);

       } //end for post combat

    }




    //include burn
    let attackerPostDamage = attacker.combatEffects.recoil - attacker.combatEffects.postHeal + defender.combatEffects.burn;
    let defenderPostDamage = defender.combatEffects.recoil - defender.combatEffects.postHeal + attacker.combatEffects.burn;

    if (attackerWounds > 0){
      attackerPostDamage+= attacker.combatEffects.postHeal;
    }

    if (defenderWounds > 0){
      defenderPostDamage+= defender.combatEffects.postHeal;
    }

    //set initial recoil values - theese will have values for the attacker and defender but those values will be overwritten by the above values
    let attackerTeamPost = new Array(7).fill(0);
    let defenderTeamPost = new Array(7).fill(0);


    let attackerTeamSpecial = new Array(7).fill(0);
    let defenderTeamSpecial = new Array(7).fill(0);



    if (attackerSpecialActivated && attacker.combatEffects.spiral > 0){ //should also check for not postbattle special i guess
      attackerTeamSpecial[attacker.listIndex]+= attacker.combatEffects.spiral;
      //attackerSpecial.charge = Math.max(0, attackerSpecial.charge - attacker.combatEffects.spiral);
    }

    if (defenderSpecialActivated && defender.combatEffects.spiral > 0){
      defenderTeamSpecial[defender.listIndex]+= defender.combatEffects.spiral;
      //defenderSpecial.charge = Math.max(0, defenderSpecial.charge - defender.combatEffects.spiral);
    }


    //party Heals
    //these need to build up with recoil damage -> as negative recoil damage
    if (attackerPartyHeal > 0){
      for (let x of list[attacker.side]){ //for each member of side

        if (x.statusEffect.deepWounds < 1 && !(x.id === attacker.saveID) ){
          attackerTeamPost[x.listIndex]-= attackerPartyHeal; //heals are subtracted
        }
      }

      if (attackerWounds < 1){
        attackerPostDamage-= attackerPartyHeal; //for the attacker
      }
    }


    if (defenderPartyHeal > 0){
      for (let x of list[defender.side]){ //for each member of side

        if (x.statusEffect.deepWounds < 1 && !(x.id === defender.saveID) ){ 
          defenderTeamPost[x.listIndex]-= defenderPartyHeal;
        }

      }

      if (defenderWounds < 1){
        defenderPostDamage-= defenderPartyHeal;
      }
    }



    for (let element of attacker.postCombatBuffDebuff){

        //calculateBuffEffect(tempList, heroList,  i, effect, this.state.currentTurn, allyTeamPost, allyTeamSpecial, enemyTeamPost, enemyTeamSpecial);
        let reference;


        if (element.from === "owner"){
          reference = attacker
        } else if (element.from === "enemy"){
          reference = defender
        }


        let side = 0;
        let postSide;
        let specialSide;

        if (element.team === "owner"){
          side = attacker.side;
          postSide = attackerTeamPost;
          specialSide = attackerTeamSpecial;
        } else if (element.team === "enemy") {
          side = defender.side;
          postSide = defenderTeamPost;
          specialSide = defenderTeamSpecial;
        }

        let heroesInRange = [];
        heroesInRange = getDistantHeroes(list[side], reference, [attacker.saveID, defender.saveID], element.range); //excludes hero that is saved


        if (element.checkType === "distance"){
          //get heroes in range

          if (element.reference){ //just get reference if specified
            heroesInRange = heroesInRange.concat([reference]);
          }

          applyBuffList(list, heroesInRange, element, postSide, specialSide);
        } else if (element.checkType === "minDistance"){

          let minDistance = 999;
          let affectedList = [];

          for (let h of heroesInRange){
            let distance = getDistance(h.position, reference.position);

            if (distance === minDistance){
              affectedList.push(h);
            } else if (distance < minDistance){
              affectedList = [];
              affectedList.push(h);
              minDistance = distance;

            }
          }
          applyBuffList(list, affectedList, element, postSide, specialSide);

        }

    }

    for (let element of defender.postCombatBuffDebuff){


        let reference;


        if (element.from === "owner"){
          reference = defender;
        } else if (element.from === "enemy"){
          reference = attacker;
        }


        let side = 0;
        let postSide;
        let specialSide;

        if (element.team === "owner"){
          side = defender.side;
          postSide = defenderTeamPost;
          specialSide = defenderTeamSpecial;
        } else if (element.team === "enemy") {
          side = attacker.side;
          postSide = attackerTeamPost;
          specialSide = attackerTeamSpecial;
        }


        //get heroes in range
        let heroesInRange = [];
        heroesInRange = getDistantHeroes(list[side], reference, [attacker.saveID, defender.saveID], element.range);

        if (element.checkType === "distance"){
          if (element.reference){
            heroesInRange = heroesInRange.concat([reference]);
          }
          applyBuffList(list, heroesInRange, element, postSide, specialSide);

        } else if (element.checkType === "minDistance"){

          let minDistance = 999;
          let affectedList = [];

          for (let h of heroesInRange){
            let distance = getDistance(h.position, reference.position);

            if (distance === minDistance){
              affectedList.push(h);
            } else if (distance < minDistance){
              affectedList = [];
              affectedList.push(h);
              minDistance = distance;

            }
          }
          applyBuffList(list, affectedList, element, postSide, specialSide);

        }
       

    }

    console.log(attacker);
    console.log(defender);

    //apply post combat damage to both teams

    for (let x of list[attacker.side]){ //for each member of side
      if (heroValid(list[attacker.side][x.listIndex])){
        list[attacker.side][x.listIndex].currentHP = Math.min(Math.max(1,list[attacker.side][x.listIndex].currentHP - attackerTeamPost[x.listIndex]), list[attacker.side][x.listIndex].stats.hp);
        list[attacker.side][x.listIndex].special.charge = Math.min(Math.max(0, list[attacker.side][x.listIndex].special.charge - attackerTeamSpecial[x.listIndex]),list[attacker.side][x.listIndex].special.cd);
      }
    }

    for (let x of list[defender.side]){ //for each member of side
      if (heroValid(list[defender.side][x.listIndex])){
        list[defender.side][x.listIndex].currentHP = Math.min(Math.max(1,list[defender.side][x.listIndex].currentHP - defenderTeamPost[x.listIndex]), list[defender.side][x.listIndex].stats.hp);
        list[defender.side][x.listIndex].special.charge = Math.min(Math.max(0, list[defender.side][x.listIndex].special.charge - defenderTeamSpecial[x.listIndex]),list[defender.side][x.listIndex].special.cd);
      }
    }

    //apply post combat damage to defender/attacker

    if (newDefender.currentHP > 0){
      newDefender.currentHP = Math.min(Math.max(1, newDefender.currentHP - defenderPostDamage), newDefender.stats.hp); //cannot go below 0 from post battle damage and hp is capped
    }

    if (newAttacker.currentHP > 0){
      newAttacker.currentHP = Math.min(Math.max(1, newAttacker.currentHP - attackerPostDamage), newAttacker.stats.hp); //cannot go below 0
    }
    //set new current hp values
    list[attacker.side][attacker.listIndex].currentHP = newAttacker.currentHP;
    list[defender.side][defender.listIndex].currentHP = newDefender.currentHP;



    //increase combat Count
    list[attacker.side][attacker.listIndex].combatCount++;
    list[defender.side][defender.listIndex].combatCount++;
    return list;
  }

function getAdaptiveDamage(enemy){
  if (enemy.combatStats.def <= enemy.combatStats.res){ // if def is lower
    return "def";
  } else {
    return "res";
  }
}

export function getDamageType(weaponType, owner, enemy){
    if (owner.combatEffects.adaptive > 0){
      return getAdaptiveDamage(enemy);

    } else if (["sword", "lance", "axe", "bow", "dagger", "beast"].includes(weaponType) ){
      return "def";
    } else if (["redtome", "bluetome", "greentome", "breath", "staff", "colorlesstome"].includes(weaponType)){
      return "res";
    }
    return "error";


  }
  //Get the number of attacks for each unit (e.g. doubling)
export function getAttackCount(attacker, defender){
    let attackerCount = 1; //Has at least one
    let defenderCount = 0;

    //determine if defender gets to attack at all - first check for range -             Check for sweeps and counter disrupt which stop counter                                                                     nullC will negate other effects stopping counter
    if ( (defender.range === attacker.range || defender.combatEffects.counter > 0) && ( (attacker.combatEffects.sweep <= 0 && defender.combatEffects.selfSweep <= 0 && defender.statusEffect.counterDisrupt <= 0) || defender.combatEffects.nullC > 0 ) ){ 
      defenderCount = 1;
    }




    //add up effects that guarantee doubles and prevents doubles
    let attackerDouble = attacker.combatEffects["double"] - defender.combatEffects.enemyDouble - attacker.combatEffects.stopDouble;
    let defenderDouble = defender.combatEffects["double"] - attacker.combatEffects.enemyDouble - defender.combatEffects.stopDouble;


    //Brash assault checks if enemy is able to attack to grant the extra double stack for attacker
    if (attacker.combatEffects.brashAssault > 0 && defenderCount > 0){
      attackerDouble++;
      attacker.combatEffects["double"]++;
    }

    //out speeding gives an extra double stack
    if ( (attacker.combatStats.spd - defender.combatStats.spd) >= 5) {
      attackerDouble++;
    }

    if ( (defender.combatStats.spd - attacker.combatStats.spd) >= 5) {
      defenderDouble++;
    }



    if (attacker.combatEffects.nullEnemyFollowUp > 0){
      defenderDouble-= defender.combatEffects["double"]; //neutralize enemy effects that guarantee their follow up
    }

    if (attacker.combatEffects.nullStopFollowUp > 0){

      attackerDouble+= defender.combatEffects.enemyDouble; // neutralize enemy effects that prevent follow ups
      attackerDouble+= attacker.combatEffects.stopDouble; //neutralize own effects that prevent follow ups

    }

    if (defender.combatEffects.nullEnemyFollowUp > 0){
      attackerDouble-= attacker.combatEffects["double"]; //neutralize enemy effects that guarantee follow ups
    }

    if (defender.combatEffects.nullStopFollowUp > 0){
      defenderDouble+= attacker.combatEffects.enemyDouble; // neutralize enemy effects that prevent follow ups
      defenderDouble+= defender.combatEffects.stopDouble; //neutralize own effects that prevent follow ups

    }

    //if double stack is at least 1, give an extra attack
    if (attackerDouble > 0){
      attackerCount++;
    }

    if (attacker.combatEffects.brave > 0){ //if brave effect, attack is doubled
      attackerCount = attackerCount * 2;
    }

    if (defenderDouble > 0 && defenderCount > 0){
      defenderCount++;
    }

    if (defender.combatEffects.brave > 0){
      defenderCount = defenderCount * 2;
    }

    return [attackerCount, defenderCount];
  }
  //Given the attack counts, return the order in the form of a stack list
export function getAttackOrder(stack, attacker, defender){
    //basic attack order without extra skills
    //
    //the number of attacks from each hero
    let attackerHits = stack[0];
    let defenderHits = stack[1];


    //The amount of hits performed at a time - for brave effects
    let attackerRoundHits = 1;
    let defenderRoundHits = 1;

    if (attacker.combatEffects.brave > 0){
      attackerRoundHits = 2;
    }

    if (defender.combatEffects.brave > 0){
      defenderRoundHits = 2;
    }

    let attackStack = [];


    //vantage attack
    if (defenderHits > 0 && defender.combatEffects.vantage > 0){
      
      for (let i = 0; i < defenderRoundHits; i++){
        attackStack.push(2);
      }

      defenderHits-= defenderRoundHits;

      if (defenderHits > 0 && defender.combatEffects.desperation > 0){ //if desperation is active get follow up attack immediately
        
        for (let j = 0; j < defenderRoundHits; j++){
          attackStack.push(2);
        }

        defenderHits-= defenderRoundHits;

      }

    }



    //first attacker attack
    if (attackerHits > 0){

      for (let i = 0; i < attackerRoundHits; i++){
        attackStack.push(1);
      }

      attackerHits-= attackerRoundHits;

      //if desperation and can double, attack does their second before defender 
      if (attackerHits > 0 && attacker.combatEffects.desperation > 0){

        for (let j = 0; j < attackerRoundHits; j++){
          attackStack.push(1);
        }

        attackerHits-= attackerRoundHits;

      }

    }



    //first defender attack

    if (defenderHits > 0){
      
      for (let i = 0; i < defenderRoundHits; i++){
        attackStack.push(2);
      }

      defenderHits-= defenderRoundHits;

      if (defenderHits > 0 && defender.combatEffects.desperation > 0){ //if desperation is active get follow up attack immediately 
        
        for (let j = 0; j < defenderRoundHits; j++){
          attackStack.push(2);
        }

        defenderHits-= defenderRoundHits;

      }
    }



    //if there are still follow up attacks to occur, then do remaining attacks
    if (attackerHits > 0){

      for (let i = 0; i < attackerRoundHits; i++){
        attackStack.push(1);
      }

      attackerHits-= attackerRoundHits;

    }


    if (defenderHits > 0){
      
      for (let i = 0; i < defenderRoundHits; i++){
        attackStack.push(2);
      }

      defenderHits-= defenderRoundHits;
    }



    //}

    return attackStack;
  }


export function calculateDamage(attacker, defender, damageType, attackerSpecial, defenderSpecial, heroList, attackStack, attackIndex){

  let WTA = calculateWeaponTriangleAdvantage(heroData[attacker.heroID.value].color, heroData[defender.heroID.value].color ); //get the WTA multiplier


  let effective = getEffectiveDamage(heroList, attacker, defender);

  //let baseDamage = attacker.combatStats.atk + Math.trunc(attacker.combatStats.atk * WTA) - defender.combatStats[damageType] ; //damage can be negative here
  let baseDamage = Math.trunc(attacker.combatStats.atk * WTA * effective) - defender.combatStats[damageType] ; //damage can be negative here

  //staff damage reduction 
  if (heroData[attacker.heroID.value].weapontype === "staff" && attacker.combatEffects.wrathful === 0){
    baseDamage = Math.trunc(baseDamage / 2); 
  }


  let attackerSpecialCharge = attackerSpecial.charge;
  let defenderSpecialCharge = defenderSpecial.charge;

  let specialDamage = 0;

  let trueDamage = attacker.combatEffects.trueDamage;

  
  let specialEffect = attackerSpecial.effect;

  let partyHeal = 0;
  let partyBuff = {};

  let attackerSpecialActivated = false;
  let defenderSpecialActivated = false;

  if (attackerSpecialCharge === 0 && attackerSpecial.type === "attack-battle"){ //if charged and an offsensive battle special

    if ("adaptive" in specialEffect){
      
      damageType = getAdaptiveDamage(defender);
      baseDamage = attacker.combatStats.atk + Math.trunc(attacker.combatStats.atk * WTA) - defender.combatStats[damageType] ; //recalc base damage
      
    }

    if ( Array.isArray(specialEffect.damage) ){ //if the damage value is a list
      
      specialDamage = getSpecialDamage(specialEffect, attacker, defender, heroList, damageType);



      for (let i of attacker.onSpecial){ //loop through effects that activate on special
        if (i !== null){

          for (let j in i){ 
            if (j === "damage"){
              //let onSpecialDamage = i.damage;
              let extraDamage = getSpecialDamage(i, attacker, defender, heroList, damageType);
              // let sHero;



              if (i.damage[3] === "trueDamage"){
                trueDamage+= extraDamage;
              } else if (i.damage[3] === "specialDamage" ){
                specialDamage+= extraDamage
              }


            } //end for damage
          } //end for i



        }

      } //end for onSpecial



      getConditionalSpecial(attacker, defender, heroList); 

      trueDamage+= attacker.combatEffects.specialTrueDamage; 

      removeConditionalSpecial(attacker, defender, heroList);
    } //end special damage calc



    //add the amplify special damage (astra, glimmer etc.)
    specialDamage = specialDamage + Math.trunc( (baseDamage +  specialDamage) * specialEffect.amplify); //amplify is not applied to true damage


    attackerSpecialCharge = attackerSpecial.cd;  //reset cd


    if ("partyHeal" in specialEffect){
      partyHeal = specialEffect.partyHeal;

    }

    if ("partyBuff" in specialEffect){
      partyBuff = specialEffect.partyBuff;
    }



    attackerSpecialActivated = true;

  } else{ //special not activated, increment normally

    if (attackerSpecialCharge >= 0){

      let chargeValue = 1; //by default 1

      if (defender.combatEffects.nullCharge < 1){ //check if defender is nulling charge effects
        chargeValue = Math.min(attacker.combatEffects.attackCharge, 2); //max charge value is 2
      }

      let guardValue = 0;

      if (attacker.combatEffects.nullGuard < 1){
        guardValue = Math.min(defender.combatEffects.guard + attacker.statusEffect.guard, 1);
      }

      //charge will not go below 0. attack charge will be at least 1 but maxes out a 2. Guard will be at least 0 but maxes out at 1.
      attackerSpecialCharge = Math.max(0, attackerSpecialCharge - chargeValue + guardValue); //- Math.min(attacker.combatEffects.attackCharge, 2) + Math.min(defender.combatEffects.guard + attacker.statusEffect.guard, 1) ); //unit attacking
    }

  } //end offensive special check 

  specialDamage+= attacker.combatEffects.reflect; //adding the reflect damage


  //all damage reduction values are 1 - percent reduced by. 0 damage reduction is thus 1 - 0 = 1.0
  //When used in calculations, 1 - damage reduction is used 
  let damageReduction = defender.combatEffects.damageReduction;


  let currentAttacker = attackStack[attackIndex];

  //if adding the first damage reduction

  let indexCounter = attackIndex - 1;
  let previousAttacks = 0; //the number of attacks from current attacker before this attack
  while (indexCounter >= 0){ //loop back until start of stack is reached

    //an attack from the current attacker has been found, increment previous attack counter
    if (attackStack[indexCounter] === currentAttacker){
      previousAttacks++;
    }
    indexCounter--;

  }

  //first attack damage reduction
  if (previousAttacks === 0){
    damageReduction = damageReduction * defender.combatEffects.firstReduction;
  }

  //if adding the consecutive damage reduction 
  //check if an attack has been made before this, then check if it was the current attacker (thus a consecutive attkack)

  if (attackIndex - 1 >= 0 && attackStack[attackIndex - 1] === currentAttacker){ 
    damageReduction = damageReduction * defender.combatEffects.consecutiveReduction;
  }

  //Follow-up reduction - if not brave then just check second attack, otherwise check 3rd and 4th
  if (attacker.combatEffects.brave > 0 && previousAttacks >= 2){ //if brave, check if 2 other attacks have been made (so it is now the 3rd or 4th)
     damageReduction = damageReduction * defender.combatEffects.followUpReduction;

  } else if (previousAttacks >= 1) { //not brave attack, check if they have done at least one attack (should only 1 since no brave effect)
    damageReduction = damageReduction * defender.combatEffects.followUpReduction;
  }

  let miracle = false;
  let reflect = false;
  let reflectDamage = 0;
  let flatReduction = 0;


  if (defenderSpecialCharge === 0 && defenderSpecial.type === "defend-battle" && 
    (defenderSpecial.range === 0 || defenderSpecial.range === getDistance(attacker.position, defender.position)  ) ){
    if (defenderSpecial.effect.factor === "miracle"){
      miracle = true;
    } else{
      damageReduction = damageReduction * defenderSpecial.effect.factor;
    }

    if ("reflect" in defenderSpecial.effect){

      if (defenderSpecial.effect.reflect["damage"].includes("mirror")){ //if the damage key of the reflect effect is a mirror image
        reflect = true; //reflect damage is calculated later
      } else {
        reflectDamage = getSpecialDamage(defenderSpecial.effect.reflect, defender, attacker, heroList, damageType); 
      }
      
    }


    if (!miracle){
      defenderSpecialCharge = defenderSpecial.cd;

      defenderSpecialActivated = true; //if its not miracle, then it is activated
      flatReduction = defender.combatEffects.specialFlatReduction; //flat reduction does not apply to miracle
    }


    //getConditionalSpecial(defender, attacker, heroList);


  } else{
    if (defenderSpecialCharge >= 0){


      let chargeValue = 1; //by default 1

      if (attacker.combatEffects.nullCharge < 1){ //check if attacker is nulling charge effects
        chargeValue = Math.min(defender.combatEffects.defenseCharge, 2); //max charge value is 2
      }

      let guardValue = 0;

      if (defender.combatEffects.nullGuard < 1){
        guardValue = Math.min(attacker.combatEffects.guard + defender.statusEffect.guard, 1);
      }
      
      defenderSpecialCharge = Math.max(0, defenderSpecialCharge - chargeValue  + guardValue); //Math.min(defender.combatEffects.defenseCharge, 2) + Math.min(attacker.combatEffects.guard + defender.statusEffect.guard, 1) );



    }
  }


  //Base damage can end up being calculated to be below 0 and special damage adds upon the base (so special damage will be reduced by negative damage). The amount dealt by base+special has to be at least 0.
  //True damage is added to total damage and is added as is regardless of the value of the negative damage
  let totalDamage = Math.max(0, baseDamage + specialDamage) + trueDamage; //total damage before reductions 

  if (reflect){
    reflectDamage =  Math.trunc( totalDamage - totalDamage * damageReduction ) + flatReduction; //the amount of reflected damage is the damage reduced by damage reduction

  }




  //[Damage Including Extra Damage] – ([Damage Including Extra Damage] x [Effect of Damage-Mitigating Skill or Special]) = Final Damage After Mitigation


  totalDamage = totalDamage - Math.trunc( totalDamage - totalDamage * damageReduction ) - flatReduction; //total damage after reductions


  //if damage dealt is less than minimum (will be 0 for the most part), then set damage to minimum damage
  if (totalDamage < attacker.combatEffects.minimumDamage){ 
    totalDamage = attacker.combatEffects.minimumDamage;
  }

  //calculate separately for base and special damage for additional info
  baseDamage = baseDamage - Math.trunc( baseDamage - baseDamage * damageReduction);
  specialDamage = specialDamage - Math.trunc( specialDamage - specialDamage * damageReduction);


  if (miracle){
    if (defender.currentHP > 1 && baseDamage + specialDamage >= defender.currentHP){ //if hp > 1 and their hp would go to 0, activate miracle
      totalDamage =  defender.currentHP - 1; //leave 1 hp
      defenderSpecialCharge = defenderSpecial.cd;

      defenderSpecialActivated = true;
    }
  }

  let damageDealt = Math.min(defender.currentHP, totalDamage); //damage dealt maxes out at the current HP of defender (for healing purposes)

  let heal = 0;

  if (attacker.statusEffect.deepWounds < 1){
    heal+= attacker.combatEffects.onHitHeal;
  }


  if (attackerSpecialActivated && attacker.statusEffect.deepWounds < 1){
    heal+= Math.trunc(attacker.combatEffects.specialHeal * damageDealt);
    if ("heal" in specialEffect){
      heal+= Math.trunc(specialEffect.heal * damageDealt); 
    }
  } 

  return {"damage": totalDamage, "reflect": reflectDamage, "base": baseDamage, "special": specialDamage, "heal": heal, "partyBuff": partyBuff, "partyHeal": partyHeal,
  "attackerSpecialCharge": attackerSpecialCharge, "defenderSpecialCharge": defenderSpecialCharge,
  "attackerSpecialActivated": attackerSpecialActivated, "defenderSpecialActivated": defenderSpecialActivated } ; ///glimmer interacts with damage reduction

}

export function getSpecialDamage(effect, owner, enemy, heroList, damageType){
    let specialDamage = 0;
    let hero; //which hero to base the damage off of
    if (effect.damage[0] === "attacker"){
      hero = owner;
    } else if (effect.damage[0] === "defender"){
      hero = enemy;
    }

    let stat = effect.damage[1];
    if (stat === "defensive"){
      stat = damageType;
    }


    let factor = effect.damage[2];

    if ("condition" in effect && checkCondition(heroList, effect.condition, owner, enemy) ){

      factor = effect["alt"];

    }

    if (stat === "flat"){
      specialDamage = factor; //special damage is flat
    } else if (stat === "hp"){ //HP specials are based on missing hp and only for attackers
      specialDamage = Math.trunc( (owner.stats.hp - owner.currentHP) * factor);

    } else{
      specialDamage = Math.trunc(hero.combatStats[stat] * factor);
    }

    return specialDamage;
}

export function calculateWeaponTriangleAdvantage(colorAttack, colorDefend){
	let val = 1.0;

	if (colorAttack === "red"){
		if (colorDefend === "blue"){
			val = 0.8;
		} else if (colorDefend === "green"){
			val = 1.2;
		} else if (colorDefend === "colorless"){
			val = 1.0; //to do, add raven effect
		}

	} else if (colorAttack === "blue"){
		if (colorDefend === "green"){
			val = 0.8;
		} else if (colorDefend === "red"){
			val = 1.2;
		} else if (colorDefend === "colorless"){
			val = 1.0; //to do, add raven effect
		}

	} else if (colorAttack === "green"){
		if (colorDefend === "red"){
			val = 0.8;
		} else if (colorDefend === "blue"){
			val = 1.2;
		} else if (colorDefend === "colorless"){
			val = 1.0; //to do, add raven effect
		}

	}
	//TODO
	//add colorless difference if raven effect
	//Add check for triangle adept and cancel affinity

	//affinity (x + 20)/20 where x is the TA amount
	//CA 1/2 will remove the x depending on situation, and at CA 3, the x will be reversed

	return val;

}


export function getEffectiveDamage(heroList, attacker, defender){


    let effectiveDamage = 1.0;

    let addedEffective = effectListToConditionList(defender.addedEffective);
    let negateEffective = effectListToConditionList(defender.negateEffective);
    //console.log(addedEffective);
    //console.log(negateEffective);

    for (let effect of attacker.effectiveCondition){ //loop through effective conditions


      let condition = effect.condition;
      if ("condition" in effect){

        if ( (checkCondition(heroList, condition, attacker, defender) || addedEffective.findIndex(conditionMatch, condition) >= 0) && negateEffective.findIndex(conditionMatch, condition) < 0 ) { 
          effectiveDamage = 1.5;
        }
      }


    }

  return effectiveDamage;

}

//Get the amount of spaces from first position to the second position
export function getDistance(first, second){

  if (first < 0 || second < 0){
    return -1;
  }

  let firstRC = positionToRowColumn(first);
  let secondRC = positionToRowColumn(second);

  let distance = 0;


  distance += Math.abs(firstRC[1] - secondRC[1]); //difference in columns
  distance += Math.abs(firstRC[0] - secondRC[0]); //difference in rows

  return distance;

}
export function positionToRowColumn(position){

  let row = Math.floor(position/6);
  let column = position%6;

  return [row, column];
}

export function rowColumnToPosition(rc){
    return rc[0] * 6 + rc[1];
}

  //Return list of adjacent allies 
export function getAdjacentAllies(hList, hero){
  let adjacentList = [];
  let position = hero.position;

  for (let x of hList){

    let distance = getDistance(x.position, position);

    if (x.id !== hero.id && distance >= 0 && distance <= 1 ){
      adjacentList.push(x);
    }

  }

  return adjacentList;
}

//Get heroes within a distance from a position. Does not include the hero in position
export function getDistantHeroes(hList, hero, excluded, distance){
  let distantList = [];

  let position = hero.position;

  for (let x of hList){

    let allyDistance = getDistance(x.position, position); 

    if (x.id !== hero.id && !excluded.includes(x.id) && allyDistance <= distance && allyDistance >= 0  && heroValid(x)){
      distantList.push(x);
    }

  }    
  return distantList;
}

//main function that checks if a condition has been met to grant extra effects
//heroList - the state of the board
//conditionType - keyword for the type of condition
//owner - the hero that is the owner of the conditional
//enemy - the other hero in battle with the owner.

export function checkCondition(heroList, condition, owner, enemy, turn){

  //let keyWordList = ["phase"];  //this contains the list of keywords that denote at start of a condition

  let result = true;

  for (let i = 0; i < condition.length; i++){ //outer list - all condition lists in this list must be true - and conditions

    let innerCondition = condition[i]; //loop through the lists in the lists
    let innerResult = false;


    for (let j = 0; j < innerCondition.length; j++){ //inner list - at least one condition in this list must be true - or conditions

      let keyWord = innerCondition[j];


      if (Array.isArray(keyWord)){
        console.log(keyWord);
        innerResult = checkCondition(heroList, keyWord, owner, enemy, turn);

      //so always on effects can be mixed with conditional effects easily
      } else if (keyWord === "always"){
        innerResult = true;
        
      } else if (keyWord === "phase"){ //owner must be on the correct phase 

        if (innerCondition[j+1] === "player" && owner.initiating){ //initiating condition
          innerResult = true;
        } else if (innerCondition[j+1] === "enemy" && !owner.initiating){ //initiated on condition
          innerResult = true;
        } 
        j = j + 1; //Skip one element
      } else if (keyWord === "adjacent"){
        if (innerCondition[j+1] && getAdjacentAllies(heroList[owner.side], owner).length > 0  ){ //adjacent to at least one ally
          innerResult = true;
        } else if (!innerCondition[j+1] && getAdjacentAllies(heroList[owner.side], owner).length === 0  ){ //adjacent to no allies
          innerResult = true;
        }

        j = j + 1;

      } else if (keyWord === "enemyAdjacent"){
        if (innerCondition[j+1] && getAdjacentAllies(heroList[enemy.side], enemy).length > 0  ){ //adjacent to at least one ally
          innerResult = true;
        } else if (!innerCondition[j+1] && getAdjacentAllies(heroList[enemy.side], enemy).length === 0  ){ //adjacent to no allies
          innerResult = true;
        }

        j = j + 1;

      } else if (keyWord === "hp"){ //if hp must be at a ceretain threshold

        let hpThreshold =  Math.trunc(innerCondition[j+2] * owner.stats.hp);

        if (innerCondition[j+1] === "greater" && owner.currentHP >= hpThreshold ){
          innerResult = true;
        } else if (innerCondition[j+1] === "less" && owner.currentHP <= hpThreshold ){
          innerResult = true;
        }



        j = j + 2;

      } else if (keyWord === "enemyhp"){ //if hp must be at a ceretain threshold

        let hpThreshold =  Math.trunc(innerCondition[j+2] * enemy.stats.hp);

        if (innerCondition[j+1] === "greater" && enemy.currentHP >= hpThreshold ){
          innerResult = true;
        } else if (innerCondition[j+1] === "less" && enemy.currentHP <= hpThreshold ){
          innerResult = true;
        }



        j = j + 2;

      } else if (keyWord === "heroInfoCheck"){ //needs to check value of the other  hero (e.g. weapon type, movement type etc)

        let info = heroData[enemy.heroID.value];
        
        if (innerCondition[j+2].includes(info[innerCondition[j+1]])){
          innerResult = true;
        }

        j = j + 2;

      } else if (keyWord === "distanceCheck"){


        if (getDistance(owner.position, enemy.position) <= innerCondition[j+1]){
          innerResult = true;
        }

        j = j + 1;
      } else if (keyWord === "specialType"){ //needs to check value of enemy hero (e.g. weapon type, movement type etc)

        

        if (innerCondition[j+1].includes(owner.special.type) ){
          innerResult = true;
        }

        j = j + 1;
      } else if (keyWord === "statCompare"){ //compare stat values between owner and enemy

        let statCheck = innerCondition[j+2];
        let statType = innerCondition[j+1];
        let ownerStat = 0;
        let enemyStat = 0;

        //get appropriate values to compare
        if (statCheck === "HP"){
          ownerStat = owner.currentHP;
          enemyStat = enemy.currentHP;
        } else if (statType === "visible") {
          ownerStat = owner.visibleStats[statCheck];
          enemyStat = enemy.visibleStats[statCheck];
        } else if (statType === "combat") {
          ownerStat = owner.combatStats[statCheck];
          enemyStat = enemy.combatStats[statCheck];
        }

        if (innerCondition[j+3] === "greater" &&  (ownerStat - enemyStat) >= innerCondition[j+4]  ){
          innerResult = true;
        } else if (innerCondition[j+3] === "less" &&  (enemyStat - ownerStat) >= innerCondition[j+4]  ){
          innerResult = true;
        }


        j = j + 4;

      } else if (keyWord === "statCompare2"){ //compare different stat values, specifying a hero for both - statCompare can be converted to use this too
        //"effect": [{"type": "conditionalCombat", "condition": [["statCompare2", "combat", "owner", "atk", "enemy", "def", "greater", 1]], 
        let statCheck1 = innerCondition[j+3];
        let statCheck2 = innerCondition[j+5]
        let statType = innerCondition[j+1];
        let stat1 = 0;
        let stat2 = 0;


        let hero1;
        let hero2;

        if (innerCondition[j+2] === "owner"){
          hero1 = owner;
        } else if (innerCondition[j+2] === "enemy"){
          hero1 = enemy;
        }

        if (innerCondition[j+4] === "owner"){
          hero2 = owner;
        } else if (innerCondition[j+4] === "enemy"){
          hero2 = enemy;
        }

        // //get appropr  iate values to compare
        if (statCheck1 === "HP"){
          stat1 = hero1.currentHP;

        } else if (statType === "visible") {
          stat1 = hero1.visibleStats[statCheck1];

        } else if (statType === "combat") {
          stat1 = hero1.combatStats[statCheck1];
        }


        if (statCheck2 === "HP"){
          stat2 = hero2.currentHP;
        } else if (statType === "visible") {
          stat2 = hero2.visibleStats[statCheck2];
        } else if (statType === "combat") {
          stat2 = hero2.combatStats[statCheck2];
        }


        if (innerCondition[j+6] === "greater" &&  (stat1 - stat2) >= innerCondition[j+7]  ){
          innerResult = true;
        } else if (innerCondition[j+6] === "less" &&  (stat2 - stat1) >= innerCondition[j+7]  ){
          innerResult = true;
        }

        j = j + 7;

      } else if (keyWord === "distantAllies"){ //check if a certain number of allies within the range given range

        let distantAllies = getDistantHeroes(heroList[owner.side], owner, [], innerCondition[j+1]); //get the allies within the range

        if (innerCondition[j+2] === "greater" && distantAllies.length >= innerCondition[j+3]){
          innerResult = true;
        } else if (innerCondition[j+2] === "less" && distantAllies.length <= innerCondition[j+3]){
          innerResult = true;
        }

        j = j + 3;


      } else if (keyWord === "distantEnemies"){ //check if a certain number of enemies are within the range given range 


        //enemyside has to be calculated since the enemy might be a placeholder (which is sometimes themsel)
        let enemySide = getEnemySide(owner.side); //

        let distantEnemies = getDistantHeroes(heroList[enemySide], owner, [], innerCondition[j+1]); //get the allies within the range

        if (innerCondition[j+2] === "greater" && distantEnemies.length >= innerCondition[j+3]){ //chec for amount
          innerResult = true;
        } else if (innerCondition[j+2] === "less" && distantEnemies.length <= innerCondition[j+3]){
          innerResult = true;
        }

        j = j + 3;

      } else if (keyWord === "distantAllyCompare"){ //compare number of allies within range for owner and enemy



        let distantAllies = getDistantHeroes(heroList[owner.side], owner, [], innerCondition[j+1]).length; //get the allies within the range
        let distantEnemies = getDistantHeroes(heroList[enemy.side], enemy, [], innerCondition[j+1]).length; //get the allies within the range

        if (innerCondition[j+2] === "greater" && distantAllies >= distantEnemies){ //chec for amount
          innerResult = true;
        } else if (innerCondition[j+2] === "less" && distantAllies <= distantEnemies){
          innerResult = true;
        }

        j = j + 2;


      } else if (keyWord === "allyInfo"){ //check if there are enough allies within range are of certain types

        //j+1 is range
        //j+2 is the allyInfo type
        //j+3 is the acceptable allyInfo values
        //j+4 minimum needed
        //j+5 greater/less 

        let distantAllies = getDistantHeroes(heroList[owner.side], owner, [], innerCondition[j+1]); //get the allies within the range

        let validAlliesCount = 0;

        for (let x of distantAllies){
          let info = heroData[x.heroID.value];



          if (innerCondition[j+3].includes(info[innerCondition[j+2]])){
            validAlliesCount++;

          }


        }


        if (innerCondition[j+4] === "all"){
          if (validAlliesCount === distantAllies.length){ //if all allies in range meet the condition
            innerResult = true;
          }

        } else if (validAlliesCount >= innerCondition[j+4] && innerCondition[j+5] === "greater"){ //sufficient allies that are in range meet the condition

          innerResult = true;
        } else if (validAlliesCount <= innerCondition[j+4] && innerCondition[j+5] === "less"){ //sufficient allies that are in range meet the condition

          innerResult = true;
        } 

        j = j + 5;

      } else if (keyWord === "teamInfo"){

        let validAlliesCount = 0;

        for (let ally of heroList[owner.side]){
          let info = heroData[ally.heroID.value];


          if (innerCondition[j+2].includes(info[innerCondition[j+1]])){
            validAlliesCount++;
          }

        } //end for loop team

        if (validAlliesCount >= innerCondition[j+3] && innerCondition[j+4] === "greater"){ //sufficient allies that are in range meet the condition

          innerResult = true;
        } else if (validAlliesCount <= innerCondition[j+3] && innerCondition[j+4] === "less"){ //sufficient allies that are in range meet the condition

          innerResult = true;
        } 

        j = j + 4;

      } else if (keyWord === "turn"){ //check turn

        let factor = innerCondition[j+1];

        let mod = innerCondition[j+2];

        let check = (turn - 1) + mod;

        if (factor === 0 && turn === mod){ //no factor, asking for a specific turn
          innerResult = true;
        } else if ( (check) % factor === 0){ //check if nth turn has been reached
          innerResult = true;
        }


        j = j + 2;

      } else if (keyWord === "turnRange"){

        //j+1 is the lower bound
        //j+2 is the upper bound
        //bounds are inclusive
        //j+3 asks if you want to be within the range or out of range

        if (turn >= innerCondition[j+1] && turn <= innerCondition[j+2] && innerCondition[j+3]){
          innerResult = true;
        } else if ( (turn < innerCondition[j+1] || turn > innerCondition[j+2]) && !innerCondition[j+3]){
          innerResult = true;
        }

        j = j + 3;


      } else if (keyWord === "statPenalty"){ //only for harsh command basically

        let check = {};
        if (innerCondition[j+1] === "player"){
          check = owner;
        } else if (innerCondition[j+1] === "enemy"){
          check = enemy;
        }

        let type = innerCondition[j+2];

        for (let s in check.debuff){
          if (check.debuff[s] > 0 && (check.combatEffects.penaltyNeutralize[s] < 1 || type === "battleStart") ){ //check if that stat is debuffed and if that debuff is not neutralized or if check is at battleStart (so before neutralizers come in)
            innerResult = true;
          }

          //check if buffs are reversed to penalties through panic.
          if (check.statusEffect.panic > 0 && check.buff[s] > 0 && (check.combatEffects.penaltyNeutralize[s] < 1 || type === "battleStart")  ){ 
            innerResult = true;
          }

        }

        j = j + 2;

      } else if (keyWord === "penalty"){
        
        let check = {};
        if (innerCondition[j+1] === "player"){
          check = owner;
        } else if (innerCondition[j+1] === "enemy"){
          check = enemy;
        }

        let type = innerCondition[j+2];
        //This value will be either
        //battleStart - before combat effects activate so neutralizers are not used for the check
        //combat - during combat so needs to check for neutralizers

        for (let s in check.debuff){

          if (check.debuff[s] > 0 && (check.combatEffects.penaltyNeutralize[s] < 1 || type === "battleStart") ){ //check if that stat is debuffed and if that debuff is not neutralized or if check is at battleStart (so before neutralizers come in)
            innerResult = true;
          }

          //check if buffs are reversed to penalties through panic. With panic status, this will return true anyways but this is just here for completeness
          if (check.statusEffect.panic > 0 && check.buff[s] > 0 && (check.combatEffects.penaltyNeutralize[s] < 1 || type === "battleStart")  ){ 
            innerResult = true;
          }

        }

        if (Object.keys(check.statusEffect).filter(m =>  check.statusEffect[m] >= 1).length >= 1  ){//if any statusEffect on check
          innerResult = true;
        }

        j = j + 2;


      } else if (keyWord === "statBonus"){

        let check = {};
        let other;
        if (innerCondition[j+1] === "player"){
          check = owner;
          other = enemy;
        } else if (innerCondition[j+1] === "enemy"){
          check = enemy;
          other = owner;
        }

        let type = innerCondition[j+2];

        for (let s in check.buff){

          if (check.buff[s] > 0 && check.statusEffect.panic < 1 &&  (other.combatEffects.buffNeutralize[s] < 1 || type === "battleStart") ){ //check if stat is buffed, not panicked and  not neutralized (if battle start, then neutralize is not counted)
            innerResult = true;
          }


        }



        j = j + 2;

      } else if (keyWord === "bonus"){

        let check = {};
        let other;
        if (innerCondition[j+1] === "player"){
          check = owner;
          other = enemy;
        } else if (innerCondition[j+1] === "enemy"){
          check = enemy;
          other = owner;
        }

        let type = innerCondition[j+2];

        for (let s in check.buff){

          if (check.buff[s] > 0 && check.statusEffect.panic < 1 &&  (other.combatEffects.buffNeutralize[s] < 1 || type === "battleStart") ){ //check if stat is buffed, not panicked and  not neutralized (if battle start, then neutralize is not counted)
            innerResult = true;
          }


        }

        if (Object.keys(check.statusBuff).filter(m =>  check.statusBuff[m] >= 1).length >= 1  ){ //check for status buffs
          innerResult = true;
        }


        j = j + 2;
      } else if (keyWord === "combatCount"){ //

        if (owner.combatCount === innerCondition[j+1] ){
          innerResult = true;
        }

        j = j + 1;
      } else if (keyWord === "cardinal"){

        if (innerCondition[j+1] && checkCardinal(owner, enemy)){ //condition requires cardinal and they are cardinal
          innerResult = true;
        } else if (!innerCondition[j+1] && !checkCardinal(owner, enemy)){ //condition requires not cardinal and they are not cardinal
          innerResult = true
        }

        j = j + 1;

      } else if (keyWord === "cardinalRC"){

        if (innerCondition[j+1] && checkCardinalRowColumn(owner, enemy, innerCondition[j+2], innerCondition[j+3])){ //condition requires cardinal and they are cardinal
          innerResult = true;
        } else if (!innerCondition[j+1] && !checkCardinalRowColumn(owner, enemy, innerCondition[j+2], innerCondition[j+3])){ //condition requires not cardinal and they are not cardinal
          innerResult = true
        }

        j = j + 3;

      } else if (keyWord === "tactic"){

        if (innerCondition[j+1] && checkTactic(enemy, heroList)){ 
          innerResult = true;
        } else if (!innerCondition[j+1] && !checkTactic(enemy, heroList)){ 
          innerResult = true
        }



        j = j + 1;
      } else if (keyWord === "specialReady"){


        let check = {};
        if (innerCondition[j+1] === "player"){
          check = owner;
        } else if (innerCondition[j+1] === "enemy"){
          check = enemy;
        }

        //check if their special is charged
        if (innerCondition[j+2] && check.special.charge === 0){ 
          innerResult = true;
        } else if (!innerCondition[j+2] && check.special.charge !== 0){ 
          innerResult = true
        }

        j = j + 2;
      } else if (keyWord === "specialMax"){

        let check = {};
        if (innerCondition[j+1] === "player"){
          check = owner;
        } else if (innerCondition[j+1] === "enemy"){
          check = enemy;
        }

        //check if their special is charged
        if (innerCondition[j+2] && check.special.charge === check.special.cd){ 
          innerResult = true;
        } else if (!innerCondition[j+2] && check.special.charge !== check.special.cd){ 
          innerResult = true
        }

        j = j + 2;
      }


    }//end for j

    if (!innerResult){ //if the innerResult false, then result becomes false
      result = false;
    }


  } //end for i



  return result;
} //end CheckCondition

export function heroReqCheck(owner, teamList, heroReq, heroList, turn){

  let filteredList = [];//[...allyList]; //copy of allyList


  filteredList = teamList.filter(checkConditionHero(owner, heroReq, heroList, turn) ); //filter out 

  console.log(filteredList);
  return filteredList;
}

export function calculateVariableEffect(heroList, variableEffect, owner, enemy, turn){

  if (variableEffect.key === "allyReq"){
    //let distantAllies = Math.min(getDistantHeroes(heroList[owner.side], owner, [] , variableEffect.distance).length, variableEffect.maxAllies);

    let distantAllies = 0;


    let teamListValid = []; //copy of list that only has valid heroes (not dead and on the board)

    let teamList = heroList[owner.side];

    for (let x in teamList){
      if (heroValid(teamList[x]) && teamList[x].id !== owner.id ){ //exclude themselves, self buff req is done separately
        teamListValid.push(teamList[x]);
      }
    } 
    let passedHeroList = [];

    if ("allyReq" in variableEffect){
      passedHeroList = heroReqCheck(owner, teamListValid, variableEffect.allyReq, heroList, turn) ; //Get the list of allies that pass the req che

    } //end ally req

    distantAllies = Math.min(passedHeroList.length, variableEffect.maxAllies);


    let buff = (variableEffect.multiplier * distantAllies + variableEffect.constant);


    if (distantAllies < variableEffect.minAllies){
      buff = 0;
    }

    let statBuff = {};
    for (let x of variableEffect.stats){
      statBuff[x] = buff;
    }

    return {"statBuff": statBuff}; //return as combat effect object
  } else if (variableEffect.key === "session"){

    let buffValue = 0;

    if (variableEffect.phase === "enemy" && !owner.initiating){

      let enemies = heroList[enemy.side];
      let enemiesActed = 0;

      for (let y of enemies){
        if (y.end){
          enemiesActed++;
        }

      } 

      buffValue = Math.max( variableEffect.min, variableEffect.constant - (variableEffect.multiplier * enemiesActed) );
    } else if (variableEffect.phase === "player" && owner.initiating){

      let allies = heroList[owner.side];
      let alliesActed = 0;

      for (let y of allies){
        if (y.end){
          alliesActed++;
        }

      } 

      buffValue = Math.min( variableEffect.max, variableEffect.constant + (variableEffect.multiplier * alliesActed) );


    }

    let statBuff = {};
    for (let x of variableEffect.stats){
      statBuff[x] = buffValue;
    }
    return {"statBuff": statBuff}; //return as combat effect object

  } else if (variableEffect.key === "bonusPenaltyBuffs"){ //buffs that depend on bonus or penalties on a unit

    let buffValue = 0;
    let reference;
    let other;

    if (variableEffect.reference === "owner"){
      reference = owner;
      other = enemy;
    } else if (variableEffect.reference === "enemy"){
      reference = enemy;
      other = owner;
    } 

    if (variableEffect.subtype === "buff"){

      if (reference.statusEffect.panic < 1){ //if check for panic to see if buffs are not debuffs - penalty neutralize will not being back buffs

      for (let s in other.combatEffects.buffNeutralize){ //loop through stats
        if (other.combatEffects.buffNeutralize[s] <= 0){ //if other is not neutralizing the stat, add it to buff value
          buffValue+= reference.buff[s];
        }
      }


      }


    } else if(variableEffect.subtype === "debuff"){

      for (let s in reference.combatEffects.penaltyNeutralize){ //loop through stats
        if (reference.combatEffects.penaltyNeutralize[s] <= 0){ //if the reference is not neutralizing penalties add it to the buff value
          buffValue+= reference.debuff[s];

          if (reference.statusEffect.panic > 0){ //if panicked then also add the buff values
            buffValue+= reference.buff[s];
          }

        }
      }

    }

    buffValue = Math.trunc(buffValue * variableEffect.multiplier);

    let statBuff = {};
    for (let x of variableEffect.stats){
      statBuff[x] = buffValue;
    }
    return {"statBuff": statBuff}; //return as combat effect object




  }


}

export function calculateVariableCombat(heroList, variableEffect, owner, enemy, turn){

  
  //combatEffect contains a list of combat effects that will be granted
  //The value of the combat effect is then calculated depending on the key


  //bonus damage uses stats and factor
  if (variableEffect.key === "bonusDamage"){
    let unit = variableEffect.unit;
    let value = 0;

    if (variableEffect.stat === "flat") {
      value = variableEffect.factor;
    } else if (unit === "owner"){
      value = Math.trunc(owner.combatStats[variableEffect.stat] * variableEffect.factor);  
    } else if (unit === "enemy"){
      value = Math.trunc(enemy.combatStats[variableEffect.stat] * variableEffect.factor); 
    } else if (unit === "difference"){
      value = Math.trunc(owner.combatStats[variableEffect.stat] - enemy.combatStats[variableEffect.stat] * variableEffect.factor); //not used yet, will probably be used for speed diff weapons
    }

    if ("max" in variableEffect){
      value = Math.min(variableEffect.max, value); //variable effect is capped
    }


    let combatEffectList = {};
    for (let x of variableEffect.combatEffects){
      combatEffectList[x] = value;
    }
    return combatEffectList;

  } else if (variableEffect.key === "statDifferenceEffect"){

    let statCheck = variableEffect.stat;
    let enemyStatCheck = variableEffect.stat;
    let factor = variableEffect.factor;
    let max = variableEffect.max;

    if ("enemyStat" in variableEffect){
      enemyStatCheck = variableEffect.enemyStat;
    }



    let visibleDifference = owner.visibleStats[statCheck] - enemy.visibleStats[enemyStatCheck];
    let combatDifference = owner.combatStats[statCheck] - enemy.combatStats[enemyStatCheck];

    let visibleValue = Math.trunc(visibleDifference * factor);
    let combatValue = Math.trunc(combatDifference * factor);



    visibleValue = Math.min(max, visibleValue );

    combatValue = Math.min(max, combatValue );

    let combatEffectList = {};
    for (let x of variableEffect.combatEffects){
      
      if (x.includes("Reduction")){ //damage reduction effects 

        //prebattle reductions use visible, every other uses combat values
        if (x === "preBattleReduction" && visibleValue > 0){
          combatEffectList[x] = 1 - (visibleValue / 100.0 );
        } else if (combatValue > 0) {
          combatEffectList[x] = 1 - (combatValue / 100.0 );
        }

      } else if (visibleValue > 0 && "stats" in variableEffect){ //if it has a stats key, then make a combat object for it (for stuff like lulls) - visible value has to be > 0 because it will have no effect otherwise

          let statList = variableEffect.stats;
          combatEffectList[x] = {};


          for (let m of statList){
            combatEffectList[x][m]= visibleValue;
          }

      } else if (combatValue > 0) { //just add to effect list using combat value
        combatEffectList[x] = combatValue;
      }

    } //end for

    return combatEffectList;
  } else if (variableEffect.key === "allyReq"){


    let allyCount = 0;


    let teamListValid = []; //copy of list that only has valid heroes (not dead and on the board)

    let teamList = heroList[owner.side];

    for (let x in teamList){
      if (heroValid(teamList[x]) && teamList[x].id !== owner.id ){ //exclude themselves, self buff req is done separately
        teamListValid.push(teamList[x]);
      }
    } 
    let passedHeroList = [];

    if ("allyReq" in variableEffect){
      passedHeroList = heroReqCheck(owner, teamListValid, variableEffect.allyReq, heroList, turn) ; //Get the list of allies that pass the req che

    } //end ally req

    allyCount = Math.min(passedHeroList.length, variableEffect.maxAllies);

    console.log(allyCount);

    let value = (variableEffect.multiplier * allyCount + variableEffect.constant);


    if (allyCount < variableEffect.minAllies){
      value = 0;
    }


    let combatEffectList = {};
    for (let x of variableEffect.combatEffects){
      
      if (x.includes("Reduction")){ //damage reduction effects 


        combatEffectList[x] = 1 - (value / 100.0 );


      } else if (value > 0 && "stats" in variableEffect){ //if it has a stats key, then make a combat object for it (for stuff like lulls) - visible value has to be > 0 because it will have no effect otherwise

          let statList = variableEffect.stats;
          combatEffectList[x] = {};


          for (let m of statList){
            combatEffectList[x][m]= value;
          }

      } else { //just add to effect list using combat value
        combatEffectList[x] = value;
      }

    } //end for
    return combatEffectList;


  }


}


//This function is for combat effects where the condition check occurs at the time the special activates (e.g. wrath)
export function getConditionalSpecial(owner, enemy, heroList){

  //Conditionals
  for (let x of owner.conditionalSpecial){

    if (x !== null && checkCondition(heroList, x.condition, owner, enemy)){ //if condition is true, then provide the rest of the effects

      for (let y in x){ //loop through 
        if (y !== "condition" && y !== "type"){ //everything else should be combat effects
          owner.combatEffects[y]+= x[y]; //conditional specials should give effects changing specialTrigger effects
        }


      } //end loop through gained effects



    } //end if condition true

  } //end for 


}

export function removeConditionalSpecial(owner, enemy, heroList){

  //Conditionals
  for (let x of owner.conditionalSpecial){

    //this check should be done before any changes to either hero, such that it passes the same conditons as when the getConditionalSpecial function is used
    if (x !== null && checkCondition(heroList, x.condition, owner, enemy)){ 

      for (let y in x){ //loop through 
        if (y !== "condition" && y !== "type"){ //everything else should be combat effects
          owner.combatEffects[y]-= x[y]; //remove the effects
        }


      } //end loop through gained effects



    } //end if condition true

  } //end for 


}

export function checkValidMovement(owner, other, otherAlt, participantIDs, board){


    //Invalid position
    if (other[0] === -1 || other[1] === -1){
      return false;
    }

    //otherAlt needs to be checked for trepassable terrain (e.g. not a wall) and if it is an actual space (not [-1, -1])

    if (owner[1] > 5 || owner[1] < 0 || other[1] > 5 || other[1] < 0 //column out of bounds
      || owner[0] > 7 || owner[0] < 0 || other[0] > 7 || other[0] < 0) { //row out of bounds


      return false; 

    }
    //convert to positions to check if board space is available
    let newOwnerPosition = rowColumnToPosition(owner);
    let newOtherPosition = rowColumnToPosition(other);

    if (board[newOwnerPosition] !== null &&  !participantIDs.includes(board[newOwnerPosition].id) ){ //new assistee position is occupied by other hero
      return false;

    }

    if (board[newOtherPosition] !== null &&  !participantIDs.includes(board[newOtherPosition].id) ){ //new assister position is occupied by other hero
      return false;
    }

    return true; //no issues found, movement is valid
}

//Get new positions (as row columns)
export function calculateMovementEffect(owner, other, effect){

  let ownerPos = positionToRowColumn(owner.position);
  let otherPos = positionToRowColumn(other.position);

  let otherAlt = [-1, -1];


  if (ownerPos[0] === otherPos[0]){ //same row, move along the row so change column

    let factor = otherPos[1] - ownerPos[1]; //factor determines how the participants are positioned and which way the assist applies 

    ownerPos[1]+= factor * effect.owner;

    //the other hero is moving away 2 spaces from the owner (only occurs with smite currently). Need to also get the position in between
    //This position will be used instead if the other hero cannot occupy the new position (short stop).
    //This position will also be checked if it can be occupied (e.g. if it is a wall) which would prevent the assist from working at all.
    //If movement effects are added that such that more than 1 space will have to be checked for short stopping and walls, this will have to be modified
    if (effect.other >= 2){ 
      otherAlt[0] = otherPos[0];
      otherAlt[1] = otherPos[1] + factor * (effect.other - 1);
    }

    otherPos[1]+= factor * effect.other;



  } else if (ownerPos[1] === otherPos[1]){ //same column, move along the column, so change row

    let factor = otherPos[0] - ownerPos[0];

    ownerPos[0]+= factor * effect.owner;

    if (effect.other >= 2){ 
      otherAlt[1] = otherPos[0];
      otherAlt[0] = otherPos[0] + factor * (effect.other - 1);
    }

    
    otherPos[0]+= factor * effect.other;

  }
  return {"owner": ownerPos, "other": otherPos, "otherAlt": otherAlt};

}

//given heroes, check if they are cardinal to eachother
export function checkCardinal(hero1, hero2){
  let pos1 = positionToRowColumn(hero1.position);
  let pos2 = positionToRowColumn(hero2.position);

  if (pos1[0] === pos2[0] || pos1[1] === pos2[1]){
    return true;
  } else {
    return false;
  }

}

export function checkCardinalRowColumn(hero1, hero2, width, height){
  let pos1 = positionToRowColumn(hero1.position);
  let pos2 = positionToRowColumn(hero2.position);


  //width = 0 means ignore column and only check row
  if (width === 0){

    if (Math.abs(pos1[0] - pos2[0]) <= height){
      return true;
    } else {
      return false;
    }

  }

  //height = 0 means ignore row and only check column
  if (height === 0){

    if (Math.abs(pos1[1] - pos2[1]) <= width){
      return true;
    } else {
      return false;
    }

  }

  //within both required columns and rows - NOTE - don't think any skills would use this
  if (Math.abs(pos1[1] - pos2[1]) <= width && Math.abs(pos1[0] - pos2[0]) <= height){
    return true;
  } else {
    return false;
  }



}


//tactic requirement is always <= 2 
export function checkTactic(hero, heroList){
  let allyCount = 0;  
  let moveTypeCheck = heroData[hero.heroID.value].movetype;

  for (let x of heroList[hero.side]){


    if (heroData[x.heroID.value].movetype === moveTypeCheck && heroValid(x)){ //movetype is the same and different ally
      allyCount++;
    }

  }


  if (allyCount <= 2){
    return true;
  } else {
    return false;
  }

}


//given a list of heroes and an effect (which should contain a buffList and other corresponding keys) and apply buffs in the list to list of heroes
export function applyBuffList(heroList, affectedHeroes, effect, teamPost, specialPost, turn){
  for (let y of affectedHeroes){
    for (let x of effect.list){ //loop through status buffs to apply

      if (x === "stats"){

        let value = effect.value;


        for (let z of effect.stats){ //loop through the stats list


          if (z === "highest"){

            //get the highest stats 
            let max = 0;
            let highestStat = [];
            for (let stat in effect.highMod){

              let val  = y.visibleStats[stat] + effect.highMod[stat];
              if (val === max){
                highestStat.push(stat);
              } else if (val > max){
                highestStat = [];
                highestStat.push(stat);
                max = val;
              }
            }

            //apply debuff to highest stats
            for (let i of highestStat){

              heroList[y.side][y.listIndex][effect.subtype][i] = Math.max(heroList[y.side][y.listIndex][effect.subtype][i], value); 
            }


          } else if (z === "hp"){ //special case - effects that 

              if (effect.subtype === "buff"){

                if (y.statusEffect.deepWounds < 1){                
                  teamPost[y.listIndex]-=  effect.value; //lowers the amount of post damage
                }
              } else if (effect.subtype === "debuff"){
                teamPost[y.listIndex]+=  effect.value; //raises the amount of psot damage
              }

          } else if (z === "special"){

              if (effect.subtype === "buff"){
                specialPost[y.listIndex]+= effect.value; //raises the amount special is reduced
              } else if (effect.subtype === "debuff"){
                specialPost[y.listIndex]-= effect.value; //raises the amount special is increased
              }



          } else {

            heroList[y.side][y.listIndex][effect.subtype][z] = Math.max(heroList[y.side][y.listIndex][effect.subtype][z], value); 
          }

          
        }

      } else if (x === "restore"){ //restore the unit (remove debuffs and status effects)

        heroList[y.side][y.listIndex].debuff = {"atk": 0, "spd": 0, "def": 0, "res": 0};
        heroList[y.side][y.listIndex].statusEffect = JSON.parse(JSON.stringify(statusDebuffs));


      } else { //otherwise, it should be a status buff

        if (effect.subtype === "buff"){

          heroList[y.side][y.listIndex].statusBuff[x]++; //give the status buff
        } else if (effect.subtype === "debuff"){
          heroList[y.side][y.listIndex].statusEffect[x]++; //give the status buff
        }

      }


    }
  }

}


//checks if hero is on the board and not dead
export function heroValid(hero){
  if (hero.position >= 0 && hero.currentHP > 0){
    return true;
  } else {
    return false;
  }

}

//given two conditional lists
function conditionMatch(c1, other){
  let c2 = this;
  if (this === undefined){
    c2 = other;
  }

  //true when both are array
  //false if either is string or both are string
  if (c1 === c2){
    return true;
    }

  if (c1 === null || c2 === null){

    return false;
  }

  if (c1.length !== c2.length ){ 

    return false;
  }



  for (let i =0; i < c1.length; i++){


    if ( Array.isArray(c1[i]) && Array.isArray(c2[i])) { //if either are arrays, check if the arrays are matching

      if (!conditionMatch(c1[i], c2[i])){
        return false;
      }

      //return false; //if the arrays don't match, then condition match fails

    } else if (c1[i] !== c2[i]) { //both a strings/ints, do comparison

      return false;
    }

  } //end for


  return true;
}

//returns a list of conditions give a list of effects (for )

function effectListToConditionList(effectList){

  let conditionList = [];

  for (let effect of effectList){
    if ("condition" in effect){
      conditionList.push(effect.condition);
    }
  }

  return conditionList;

}