// The global message collection
Topics = new Meteor.Collection('topics');

var testUrl = function (url) {
  var urlCheck1 =/^(([^:\/?#]+):)?(\/\/([^\/?#]*))?([^?#]*)(\\?([^#]*))?(#(.*))?/i;
  var urlCheck2 =/http/i;
  return (urlCheck1.test(url) && urlCheck2.test(url));
}

Meteor.users.allow({
  remove: function (userId) {
    // can only remove yourself
    return Meteor.userId() === userId;
  }
});
    
Topics.allow({
  insert: function (userId) {
    // the user must be logged in
    return (userId);
  },
  update: function (userId, topic, fields, modifier) {
    // can only change your own urls, or the votes for the others
    return topic.owner === userId  || (
                               fields.indexOf("_id") == -1 && 
                               fields.indexOf("title") == -1 && 
                               fields.indexOf("time") == -1 && 
                               fields.indexOf("link") == -1);
  },
  remove: function (userId, topic) {
    // can only remove your own topics
    return topic.owner === userId;
  },
  fetch: ['owner']
});

Topics.deny({
  update: function (userId, url, comment) {
    // can't change owners
    // return _.contains(fields, 'owner');
    return false;
  },
});

if (Meteor.isClient) {

  Handlebars.registerHelper("prettifyDate", function(timestamp) {
    return new Date(timestamp).toDateString('dd-MM-yy')
  });

  Handlebars.registerHelper("prettifyLink", function(link) {
    if (link && link.length > 30) {
      link = link.slice(0,27)+"...";
    }
    return link;
  });

  Handlebars.registerHelper("name", function(owner) {
    // return the mail address of the owner
    var name = "unknown";
    if (owner) {
      var user = Meteor.users.findOne({_id: owner});
      if (user) {
        name = user.username;
      }
    }
    return name;
  });

  Handlebars.registerHelper("isNew", function(time) {
    // return true if the item is less than a week old
    return (Date.now() - time < 604800000);
  });

  Handlebars.registerHelper("isOwner", function(owner) {
    // return true if the current user is the owner of the url

    return (owner === Meteor.userId());
  });

  Handlebars.registerHelper("smiles", function(_id) {
    // return the smile string
    var smiles = ":-)";
    var topic = Topics.findOne({_id: _id});
    if (topic) {
      for (var i = 0; i < topic.votes.length; i++) {
        if (topic.votes[i].value == 1) {
          smiles += ")";
        } else if (topic.votes[i].value == 2) {
          smiles += "))";
        }
      }
    }
    return smiles;
  });

  Handlebars.registerHelper("voted", function(_id) {
    // return true if the current user already voted on the topic or is its owner
    var topic = Topics.findOne({_id: _id});
    if (topic) {
      if (topic.owner === Meteor.userId()) {
        return true;
      } else {
        for (var i = 0; i < topic.votes.length; i++) {
          if (topic.votes[i].owner === Meteor.userId()) {
            return true;
          }
        }
      }
    }
    return false;
  });

  Handlebars.registerHelper("linked", function(_id) {
    // return true if there is a valid link
    var topic = Topics.findOne({_id: _id});
    return (topic && topic.link !='');
  });

  Handlebars.registerHelper("isVerified", function() {
    // return current user account first email is verified
    return Meteor.user().emails[0].verified;
    // commented for testing purpose, SWITCH IT ON IN PROD
    //return true;
  });

  // Topics collection template
  Template.topics.topics = function(){
    return Topics.find({}, { sort: { time: -1 }});
  };
    
  // Users collection template
  Template.users.users = function(){
    return Meteor.users.find({}, { sort: { username: 1 }});
  };
    
  // Create a new topic
  Template.entryfield.events = {
    'keydown #title': function(event) {
      if(event.which == 13) {
        // Submit the form
        var title = document.getElementById('title');
        var link = document.getElementById('link');
        if(title.value != '') {
          if (link.value == '' || testUrl(link.value)) {
            Topics.insert({
                title: title.value, 
                link: link.value, 
                time: Date.now(),
                owner: Meteor.userId(),
                votes: []
            });
            title.value = '';
            link.value = '';
          } else {
            link.value = 'wrong URL, try again';
          }
        }
      }
    }
  };

  // Click on a topic related icon (edit or delete), owner only
  Template.topics.events({
    'click img, tap img' : function (event) {
      if (this) {
        if (event.currentTarget.name === "delete") {
          if (this.owner === Meteor.userId()){
            if (confirm("Are you sure you want to delete "+this.title+ " ?")) {
              Topics.remove(this._id);
            }
          } else {
            for (var i = 0; i < this.votes.length; i++) {
              if (this.votes[i].owner === Meteor.userId()) {
                Topics.update(this._id, {$pull: {votes: this.votes[i]}});
              }
            }
          }
        } 
        var newTitle;
        if (event.currentTarget.name === "editTopic" && (newTitle = prompt("Please update the title", this.title))) {
          Topics.update(this._id, {$set: {title: newTitle}});
        }
        var newLink;
        if (event.currentTarget.name === "editLink" && (newLink = prompt("Please update the link", "http://"))) {
          if (testUrl(newLink)) {
            Topics.update(this._id, {$set: {link: newLink}});
          } else {
            alert("Wrong URL");
          }
        }
      }
    }
  });

  // Click on unsubscribe to delete your user account
  Template.users.events({
    'click img, tap img' : function (event) {
      if (event.currentTarget.name === "unsubscribe" &&
              Meteor.userId() &&
              confirm("Are you sure you want to unsubscribe ? This will delete permanently all your topics.")) {
        var cursor = Topics.find({owner: Meteor.userId()});
        cursor.forEach(function (topic) {
          Topics.remove(topic._id);
        });
        Topics.remove();
        Meteor.users.remove(Meteor.userId());
      }
    }
  });

  // Enter a vote for a given topic
  Template.votes.events({
    'keydown #comment': function(event) {
      if(event.which == 13) {
        // Submit the vote
        var vote = new Object();
        vote.owner = Meteor.userId();
        vote.comment = document.getElementById('comment').value;
        if (vote.comment == "") {
          vote.comment = "...";
        }
        var smile = document.getElementsByName('smile-'+this._id);
        for (var i = 0; i < 3; i++) {
          if (smile.item(i).checked) {
            vote.value = i;
          }
        }
        Topics.update(this._id, {$push: {votes: vote}});
      }
    }
  });

}

if (Meteor.isServer) {
  Meteor.startup(function () {
    // code to run on server at startup
    Accounts.config({ sendVerificationEmail: true})
    Accounts.config({ restrictCreationByEmailDomain: 'orange.com' })
    console.log("Smilemeter launched sir!")
  });

  // Validate username, without a specific error message.
  Accounts.onCreateUser(function (options, user) {
    var mail = user.emails[0].address;
    mail = mail.slice(0, mail.indexOf('@'));
    user.username = mail;
    return user;
  });
}
