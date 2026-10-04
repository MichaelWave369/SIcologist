import {fingerprint} from "../experiment/fingerprint.js";
import {profileScopes} from "./context.js";
import {LongitudinalProfile} from "./profile.js";
import {compareMetricsToProfile} from "./deviation.js";

export class LongitudinalProfileBook{
  #profiles=new Map();

  #getOrCreate(scope){
    let profile=this.#profiles.get(scope.key);
    if(!profile){
      profile=new LongitudinalProfile(scope.context,{scope:scope.scope});
      this.#profiles.set(scope.key,profile);
    }
    return profile;
  }

  admit(report,context,options={}){
    const receipts=[];
    for(const scope of profileScopes(context)){
      receipts.push(this.#getOrCreate(scope).admit(report,options));
    }

    return {
      accepted:receipts.some(r=>r.accepted),
      receipts
    };
  }

  resolve(context,{minSamples=5}={}){
    const candidates=profileScopes(context);
    for(const scope of candidates){
      const profile=this.#profiles.get(scope.key);
      if(!profile) continue;
      const snapshot=profile.snapshot();
      if(snapshot.acceptedSamples>=minSamples){
        return {
          found:true,
          requestedContext:candidates[0].context,
          selectedScope:scope.scope,
          fallbackUsed:scope.scope!=="EXACT",
          profile:snapshot
        };
      }
    }

    return {
      found:false,
      requestedContext:candidates[0].context,
      selectedScope:null,
      fallbackUsed:false,
      profile:null,
      candidates:candidates.map(scope=>{
        const snapshot=this.#profiles.get(scope.key)?.snapshot();
        return {
          scope:scope.scope,
          acceptedSamples:snapshot?.acceptedSamples??0
        };
      })
    };
  }

  evaluate(report,context,options={}){
    const resolution=this.resolve(context,options);
    if(!resolution.found){
      return {
        status:"NO_MATURE_PROFILE",
        resolution,
        comparison:null
      };
    }

    return {
      status:"PROFILE_COMPARISON_READY",
      resolution,
      comparison:compareMetricsToProfile(
        report?.metrics??{},
        resolution.profile,
        options
      )
    };
  }

  profileSnapshots(){
    return [...this.#profiles.values()]
      .map(profile=>profile.snapshot())
      .sort((a,b)=>a.profileId.localeCompare(b.profileId));
  }

  export(){
    const body={
      version:"0.4.0",
      profiles:[...this.#profiles.values()]
        .map(profile=>profile.export())
        .sort((a,b)=>JSON.stringify(a.context).localeCompare(JSON.stringify(b.context)))
    };
    return {
      ...body,
      fingerprint:fingerprint(body)
    };
  }

  static fromSnapshot(snapshot){
    if(snapshot?.version!=="0.4.0") throw new TypeError("Unsupported profile book snapshot version");
    const body={version:snapshot.version,profiles:snapshot.profiles??[]};
    if(snapshot.fingerprint&&fingerprint(body)!==snapshot.fingerprint){
      throw new Error("Profile book snapshot fingerprint mismatch");
    }

    const book=new LongitudinalProfileBook();
    for(const exported of body.profiles){
      const profile=LongitudinalProfile.fromSnapshot(exported);
      book.#profiles.set(profile.contextKey(),profile);
    }
    return book;
  }
}
