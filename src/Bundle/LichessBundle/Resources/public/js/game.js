$.widget("lichess.game", {

    _init: function() {
        var self = this;
        self.pieceMoving = false;
        self.$board = self.element.find("div.lichess_board");
        self.$table = self.element.find("div.lichess_table_wrap");
        self.$chat = $("div.lichess_chat");
        self.$connectionLost = $('#connection_lost');
        self.initialTitle = document.title;
        self.hasMovedOnce = false;
        self.premove = null;

        if (self.options.game.started) {
            self.indicateTurn();
            self.initSquaresAndPieces();
            self.initChat();
            self.initTable();
            self.initClocks();
            if (self.isMyTurn() && self.options.game.turns == 0) {
                self.element.one('lichess.audio_ready', function() {
                    $.playSound();
                });
            }
            if (!self.options.game.finished && ! self.options.player.spectator) {
                self.blur = 0;
                $(window).blur(function() {
                    self.blur = 1;
                });
            }
            self.unloaded = false;
            $(window).unload(function() {
                self.unloaded = true;
            });
            if (self.options.game.last_move) {
                self.highlightLastMove(self.options.game.last_move);
            }
        }

        if (!self.options.opponent.ai && !self.options.player.spectator) {
            // update document title to show playing state
            setTimeout(self.updateTitle = function() {
                document.title = (self.isMyTurn() && ! self.options.game.finished) ? document.title = document.title.indexOf('/\\/') == 0 ? '\\/\\ ' + document.title.replace(/\/\\\/ /, '') : '/\\/ ' + document.title.replace(/\\\/\\ /, '') : document.title;
                setTimeout(self.updateTitle, 400);
            },
            400);
        }

        var ping = $.data(document.body, 'lichess_ping');
        if (self.options.player.spectator) {
            ping.setData('watcher', self.options.game.id+'.'+self.options.player.unique_id);
        } else {
            ping.setData('player_key', lichess_data.player.alive_key);
        }
        ping.setData('get_nb_watchers', self.options.game.id);

        function syncLoop() {
            if (!self.options.opponent.ai || self.options.player.spectator) {
                setTimeout(function() {
                    self.sync(syncLoop, false);
                }, 100);
            }
        }
        setTimeout(syncLoop, 1000);
    },
    sync: function(callback, reloadIfFail) {
        var self = this;
        self.currentSync = $.ajax(self.options.url.sync.replace(/9999999/, self.options.player.version), {
            type: 'POST',
            data: {
                locale: self.options.locale
            },
            dataType: 'json',
            timeout: self.options.sync_latency + 5000,
            success: function(data) {
                if (!data) return self.onError('received empty data', reloadIfFail);
                var $cl = $('#connection_lost');
                if (self.$connectionLost.is(':visible')) self.$connectionLost.effect("explode");
                if (data.reload) {
                    location.reload();
                    return;
                }
                if (!self.options.opponent.ai && self.options.game.started && self.options.opponent.active != data.oa) {
                    self.options.opponent.active = data.oa;
                    self.get(self.options.url.opponent, {
                        success: function(html) {
                            self.$table.find('div.lichess_opponent').html(html).find('a').tipsy({
                                fade: true
                            });
                        }
                    }, false);
                }
                if (data.v && data.v != self.options.player.version) {
                    self.options.player.version = data.v;
                    self.applyEvents(data.e);
                }
                if (data.t) {
                    self.options.game.turns = data.t;
                }
                if (data.p) {
                    self.options.game.player = data.p;
                }
                if (data.c) {
                    self.updateClocks(data.c);
                }
            },
            complete: function(xhr, status) {
                if (status != 'success') {
                    self.onError('status is not success: '+status, reloadIfFail);
                }
                $.isFunction(callback) && callback();
            }
        });
    },
    isMyTurn: function() {
        return this.options.possible_moves != null;
    },
    changeTitle: function(text) {
        if (this.options.player.spectator) return;
        document.title = text + " - " + this.initialTitle;
    },
    indicateTurn: function() {
        var self = this;
        if (self.options.game.finished) {
            self.changeTitle(self.translate('Game over'));
        }
        else if (self.isMyTurn()) {
            self.element.addClass("my_turn");
            self.changeTitle(self.translate('Your turn'));
        }
        else {
            self.element.removeClass("my_turn");
            self.changeTitle(self.translate('Waiting for opponent'));
        }

        if (!self.$table.find('>div').hasClass('finished')) {
            self.$table.find("div.lichess_current_player div.lichess_player." + (self.isMyTurn() ? self.options.opponent.color: self.options.player.color)).fadeOut(self.options.animation_delay);
            self.$table.find("div.lichess_current_player div.lichess_player." + (self.isMyTurn() ? self.options.player.color: self.options.opponent.color)).fadeIn(self.options.animation_delay);
        }
    },
    movePiece: function(from, to, callback) {
        var self = this,
        $piece = self.$board.find("div#" + from + " div.lichess_piece"),
        $from = $("div#" + from, self.$board),
        $to = $("div#" + to, self.$board);

        // already moved
        if (!$piece.length) {
            self.onError(from + " " + to+' empty from square!!', true);
            return;
        }

        self.highlightLastMove(from + " " + to);
        if (!self.isPlayerColor(self.getPieceColor($piece))) {
            $.playSound();
        }

        $("body").append($piece.css({
            top: $from.offset().top,
            left: $from.offset().left
        }));
        $piece.animate({
            top: $to.offset().top,
            left: $to.offset().left
        },
        self.options.animation_delay, function() {
            var $killed = $to.find("div.lichess_piece");
            if ($killed.length && self.getPieceColor($piece) != self.getPieceColor($killed)) {
                self.killPiece($killed);
            }
            $piece.css({top: 0, left: 0});
            $to.append($piece);
            $.isFunction(callback || null) && callback();
        });
    },
    highlightLastMove: function(notation) {
        var self = this;
        var squareIds = notation.split(" ");
        $("div.lcs.moved", self.$board).removeClass("moved");
        $("#" + squareIds[0] + ",#" + squareIds[1], self.$board).addClass("moved");

    },
    killPiece: function($piece) {
        if ($.data($piece, 'draggable')) $piece.draggable("destroy");
        var self = this,
            $deads = self.element.find("div.lichess_cemetery." + self.getPieceColor($piece)),
                $square = $piece.parent();
        $deads.append($("<div>").addClass('lichess_tomb'));
        var $tomb = $("div.lichess_tomb:last", $deads),
            tomb_offset = $tomb.offset();
        $('body').append($piece.css($square.offset()));
        $piece.css("opacity", 0.5).animate({
            top: tomb_offset.top,
            left: tomb_offset.left
        },
        self.options.animation_delay * 3, 'easeInOutCubic', function() {
            $tomb.append($piece.css({
                position: "relative",
            top: 0,
            left: 0
            }));
        });
    },
    queue: function(callback) {
        this.queue.queue(callback);
    },
    dequeue: function() {
        this.queue.dequeue();
    },
    applyEvents: function(events) {
        var self = this;
        events.push({type: "premove"});

        // Queue all events
        $.each(events, function(i, event) {
            switch (event.type) {
                case 'move':
                    self.element.queue(function() {
                        // if a draw was claimable, remove the zone
                        $('div.lichess_claim_draw_zone').remove();
                        self.$board.find("div.lcs.check").removeClass("check");
                        // If I made the move, the piece is already moved on the board
                        if (self.hasMovedOnce && event.color == self.options.player.color) {
                            self.element.dequeue();
                        } else {
                            self.movePiece(event.from, event.to, function() {
                                self.element.dequeue();
                            });
                        }
                    });
                    break;
                case 'promotion':
                    self.element.queue(function() {
                        $("div#" + event.key + " div.lichess_piece").addClass(event.pieceClass).removeClass("pawn");
                        self.element.dequeue();
                    });
                    break;
                case 'check':
                    self.element.queue(function() {
                        $("div#" + event.key, self.$board).addClass("check");
                        self.element.dequeue();
                    });
                    break;
                case 'possible_moves':
                    self.element.queue(function() {
                        self.options.possible_moves = event.possible_moves;
                        self.indicateTurn();
                        self.element.dequeue();
                    });
                    break;
                case 'message':
                    self.element.queue(function() {
                        self.$chat.find('ol.lichess_messages').append(event.html)[0].scrollTop = 9999999;
                        self.element.dequeue();
                    });
                    break;
                case "castling":
                    self.element.queue(function() {
                        $("div#" + event.rook[1], self.$board).append($("div#" + event.rook[0] + " div.lichess_piece.rook", self.$board));
                        // if the king is beeing animated, stop it now
                        if ($king = $('body > div.king').orNot()) $king.stop(true, true);
                        $("div#" + event.king[1], self.$board).append($("div.lichess_piece.king."+event.color, self.$board));
                        self.element.dequeue();
                    });
                    break;
                case "enpassant":
                    self.element.queue(function() {
                        self.killPiece($("div#" + event.killed + " div.lichess_piece", self.$board));
                        self.element.dequeue();
                    });
                    break;
                case "redirect":
                    // redirect immediatly: no queue
                    window.location.href = event.url;
                    break;
                case "threefold_repetition":
                    self.element.queue(function() {
                        self.reloadTable(function() {
                            self.element.dequeue();
                        });
                    });
                    break;
                case "end":
                    // Game end must be applied firt: no queue
                    self.options.game.finished = true;
                    self.element.find("div.ui-draggable").draggable("destroy");
                    // But enqueue the visible changes
                    self.element.queue(function() {
                        self.changeTitle(self.translate('Game over'));
                        self.element.removeClass("my_turn");
                        self.reloadTable(function() {
                            self.element.dequeue();
                        });
                    });
                    break;
                case "reload_table":
                    self.element.queue(function() {
                        self.reloadTable(function() {
                            self.element.dequeue();
                        });
                    });
                    break;
                case "premove":
                    self.applyPremove();
                    break;
            }
        });
    },
    applyPremove: function() {
        var self = this;
        if (self.premove && self.options.possible_moves) {
            var move = self.premove;
            self.unsetPremove();
            if (self.inArray(move.to, self.options.possible_moves[move.from])) {
                var $fromSquare = $("#"+move.from).orNot();
                var $toSquare = $("#"+move.to).orNot();
                var $piece = $fromSquare.find(".lichess_piece").orNot();
                if ($fromSquare && $toSquare && $piece) {
                    self.dropPiece($piece, $fromSquare, $toSquare);
                }
            }
        }
    },
    setPremove: function(move) {
        var self = this;
        if (!self.options.premove || self.isMyTurn()) return;
        self.unsetPremove();
        if (move.from == move.to) return;
        self.premove = move;
        $("#"+move.from+",#"+move.to).addClass("premoved");
        self.$board.find('div.lcs.selected').removeClass('selected');
    },
    unsetPremove: function() {
        var self = this;
        self.premove = null;
        self.$board.find('div.lcs.premoved').removeClass('premoved');
    },
    dropPiece: function($piece, $oldSquare, $newSquare) {
        var self = this,
        squareId = $newSquare.attr('id'),
        moveData = {
            from: $oldSquare.attr("id"),
            to: squareId,
            b: self.blur
        };

        if (self.options.premove && !self.isMyTurn()) {
            return self.setPremove({ from: moveData.from, to: moveData.to });
        }

        self.$board.find('div.lcs.selected').removeClass('selected');
        self.hasMovedOnce = true;
        self.blur = 0;
        self.options.possible_moves = null;
        self.movePiece($oldSquare.attr("id"), squareId);

        function sendMoveRequest(moveData) {
            self.post(self.options.url.move, {
                success: self.options.opponent.ai ? function() {
                    setTimeout(function() {
                        self.sync();
                    },
                    self.options.animation_delay);
                }: null,
                data: moveData,
            }, true);
        }

        var color = self.options.player.color;
        // promotion
        if ($piece.hasClass('pawn') && ((color == "white" && squareId[1] == 8) || (color == "black" && squareId[1] == 1))) {
            var $choices = $('<div class="lichess_promotion_choice">').appendTo(self.$board).html('\
                    <div rel="queen" class="lichess_piece queen ' + color + '"></div>\
                    <div rel="knight" class="lichess_piece knight ' + color + '"></div>\
                    <div rel="rook" class="lichess_piece rook ' + color + '"></div>\
                    <div rel="bishop" class="lichess_piece bishop ' + color + '"></div>').fadeIn(self.options.animation_delay).find('div.lichess_piece').click(function() {
                        moveData.options = {
                            promotion: $(this).attr('rel')
                        };
                        sendMoveRequest(moveData);
                        $choices.fadeOut(self.options.animation_delay, function() {
                            $choices.remove();
                        });
                    }).end();
        }
        else {
            sendMoveRequest(moveData);
        }
    },
    initSquaresAndPieces: function() {
        var self = this;
        if (self.options.player.spectator) {
            return;
        }
        // init squares
        self.$board.find("div.lcs").each(function() {
            var squareId = $(this).attr('id');
            $(this).droppable({
                accept: function(draggable) {
                    return (self.options.premove && !self.isMyTurn())
                    || (self.isMyTurn() && self.inArray(squareId, self.options.possible_moves[draggable.parent().attr('id')]));
                },
                drop: function(ev, ui) {
                    self.dropPiece(ui.draggable, ui.draggable.parent(), $(this));
                },
                hoverClass: 'droppable-hover'
            });
        });

        // init pieces
        self.$board.find("div.lichess_piece." + self.options.player.color).each(function() {
            $(this).draggable({
                distance: 15,
                containment: self.$board,
                helper: function() {
                    return $('<div>').attr("class", $(this).attr("class")).attr('data-key', $(this).parent().attr('id')).appendTo(self.$board);
                },
                start: function() {
                    self.pieceMoving = true;
                    $(this).addClass("moving");
                },
                stop: function() {
                    self.pieceMoving = false;
                    $(this).removeClass("moving");
                }
            });
        });

        /*
         * Code for touch screens like android or iphone
         */

        self.$board.find("div.lichess_piece." + self.options.player.color).each(function() {
            $(this).click(function() {
                self.unsetPremove();
                var $square = $(this).parent();
                if ($square.hasClass('selectable')) return;
                var isSelected = $square.hasClass('selected');
                self.$board.find('div.lcs.selected').removeClass('selected');
                if (isSelected) return;
                $square.addClass('selected');
            });
        });

        self.$board.find("div.lcs").each(function() {
            $(this).hover(function() {
                var $selected = self.$board.find('div.lcs.selected');
                if ($selected.length && self.inArray($(this).attr('id'), self.options.possible_moves[$selected.attr('id')])) {
                    $(this).addClass('selectable');
                }
            },
            function() {
                $(this).removeClass('selectable');
            }).click(function() {
                self.unsetPremove();
                var $from = self.$board.find('div.lcs.selected').orNot();
                var $to = $(this);
                if (!$from || $from == $to) return;
                var $piece = $from.find('div.lichess_piece');
                if (self.options.premove && !self.isMyTurn() && $from) {
                    self.dropPiece($piece, $from, $to);
                    console.debug(self.premove);
                } else {
                    if (!$to.hasClass('selectable')) return;
                    $to.removeClass('selectable');
                    self.dropPiece($piece, $from, $(this));
                }
            });
        });

        /*
         * End of code for touch screens
         */
    },
    initChat: function() {
        var self = this;
        if (self.options.player.spectator) {
            return;
        }
        if (self.$chat.length) {
            var $form = self.$chat.find('form');
            self.$chat.find('ol.lichess_messages')[0].scrollTop = 9999999;
            var $input = self.$chat.find('input.lichess_say').one("focus", function() {
                $input.val('').removeClass('lichess_hint');
            });

            // send a message
            $form.submit(function() {
                text = $.trim($input.val());
                if (!text) return false;
                if (text.length > 140) {
                    alert('Max length: 140 chars. ' + text.length + ' chars used.');
                    return false;
                }
                $input.val('');
                self.post(self.options.url.say, {
                    data: {
                        message: text
                    }
                }, true);
                return false;
            });

            self.$chat.find('a.send').click(function() {
                $input.trigger('click');
                $form.submit();
            });

            // toggle the chat
            self.$chat.find('input.toggle_chat').change(function() {
                self.$chat.toggleClass('hidden', ! $(this).attr('checked'));
            }).trigger('change');
        }
    },
    reloadTable: function(callback) {
        var self = this;
        self.get(self.options.url.table, {
            success: function(html) {
                $('body > div.tipsy').remove();
                self.destroyClocks();
                self.$table.html(html);
                self.initTable();
                self.initClocks();
                callback();
            }
        }, false);
    },
    initTable: function() {
        var self = this;
        self.$table.css('top', (256 - self.$table.height() / 2) + 'px');
        self.$table.find('a, input, label').tipsy({
            fade: true
        });
        self.$table.find('a.lichess_play_again_decline').one('click', function() {
            $(this).parent().remove();
        });
        self.$table.find('a.lichess_rematch').click(function() {
            self.post($(this).attr('href'), {}, true);
            return false;
        });
    },
    initClocks: function() {
        var self = this;
        if (!self.canRunClock()) return;
        self.$table.find('div.clock').each(function() {
            $(this).clock({
                time: $(this).attr('data-time'),
                buzzer: function() {
                    if (!self.options.game.finished && ! self.options.player.spectator) {
                        self.post(self.options.url.outoftime, {}, false);
                    }
                }
            });
        });
        self.updateClocks();
    },
    destroyClocks: function() {
        this.$table.find('div.clock_enabled').clock('destroy').remove();
    },
    updateClocks: function(times) {
        var self = this;
        if (!self.canRunClock()) return;
        if (times || false) {
            for (color in times) {
                self.$table.find('div.clock_' + color).clock('setTime', times[color]);
            }
        }
        self.$table.find('div.clock').clock('stop');
        if (self.options.game.turns > 0) {
            self.$table.find('div.clock_' + self.options.game.player).clock('start');
        }
    },
    canRunClock: function() {
        return this.options.game.clock && this.options.game.started && ! this.options.game.finished;
    },
    getPieceColor: function($piece) {
        return $piece.hasClass('white') ? 'white': 'black';
    },
    isPlayerColor: function(color) {
        return !this.options.player.spectator && this.options.player.color == color;
    },
    translate: function(message) {
        return this.options.i18n[message] || message;
    },
    inArray: function(needle, haystack) {
        for (var i in haystack) {
            if (haystack[i] == needle) {
                return true;
            }
        }
        return false;
    },
    isPlayable: function() {
        return ! this.options.game.finished;
    },
    get: function(url, options, reloadIfFail) {
        var self = this;
        options = $.extend({
            type: 'GET',
                timeout: 8000,
                cache: false
        },
        options || {});
        $.ajax(url, options).complete(function(x, s) {
            self.onXhrComplete(x, s, null, reloadIfFail);
        });
    },
    post: function(url, options, reloadIfFail) {
        var self = this;
        options = $.extend({
            type: 'POST',
                timeout: 8000
        },
        options || {});
        $.ajax(url, options).complete(function(x, s) {
            self.onXhrComplete(x, s, 'ok', reloadIfFail);
        });
    },
    onXhrComplete: function(xhr, status, expectation, reloadIfFail) {
        if (status != 'success') {
            this.onError('status is not success: '+status, reloadIfFail);
        }
        if ((expectation || false) && expectation != xhr.responseText) {
            this.onError('expectation failed: '+xhr.responseText, reloadIfFail);
        }
    },
    onError: function(error, reloadIfFail) {
        var self = this;
        setTimeout(function() {
          if (!self.$connectionLost.is(':visible')) self.$connectionLost.effect("bounce", 200);
        }, 2000);
        if (reloadIfFail) {
            location.reload();
        }
    }
});
