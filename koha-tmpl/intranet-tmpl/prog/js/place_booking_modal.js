$('#placeBookingModal').on('show.bs.modal', function(e) {
    var button = $(e.relatedTarget);
    var biblionumber = button.data('biblionumber');
    var itemnumber = button.data('itemnumber');
    $('#booking_biblio_id').val(biblionumber);

    // Get booking id if this is an edit
    var booking_id = button.data('booking');
    if (booking_id) {
        $('#placeBookingLabel').html('Edit booking');
        $('#booking_id').val(booking_id);
    } else {
        $('#placeBookingLabel').html('Place booking');
        // Ensure we don't accidentally update a booking
        $('#booking_id').val('');
    }

    // Patron select2
    $("#booking_patron_id").kohaSelect({
        dropdownParent: $(".modal-content", "#placeBookingModal"),
        width: '50%',
        dropdownAutoWidth: true,
        allowClear: true,
        minimumInputLength: 3,
        ajax: {
            url: '/api/v1/patrons',
            delay: 250,
            dataType: 'json',
            headers: {
                "x-koha-embed": "library"
            },
            data: function(params) {
                var search_term = (params.term === undefined) ? '' : params.term;
                var query = {
                    'q': JSON.stringify({
                        "-or": [{
                                "firstname": {
                                    "-like": search_term + '%'
                                }
                            },
                            {
                                "surname": {
                                    "-like": search_term + '%'
                                }
                            },
                            {
                                "cardnumber": {
                                    "-like": search_term + '%'
                                }
                            }
                        ]
                    }),
                    '_order_by': '+me.surname,+me.firstname',
                    '_page': params.page,
                };
                return query;
            },
            processResults: function(data, params) {
                var results = [];
                data.results.forEach(function(patron) {
                    patron.id = patron.patron_id;
                    results.push(patron);
                });
                return {
                    "results": results, "pagination": { "more": data.pagination.more }
                };
            },
        },
        templateResult: function (patron) {
            if (patron.library_id == loggedInLibrary) {
                loggedInClass = "ac-currentlibrary";
            } else {
                loggedInClass = "";
            }

            var $patron = $("<span></span>")
                .append(
                    "" +
                        (patron.surname
                            ? escape_str(patron.surname) + ", "
                            : "") +
                        (patron.firstname
                            ? escape_str(patron.firstname) + " "
                            : "") +
                        (patron.cardnumber
                            ? " (" + escape_str(patron.cardnumber) + ") "
                            : "") +
                        (patron.date_of_birth
                            ? '<small><span class="age_years">' +
                              $get_age(patron.date_of_birth) +
                              " " +
                              __("years") +
                              "</span></small>"
                            : "")
                )
                .addClass(loggedInClass);
            return $patron;
        },
        templateSelection: function (patron) {
            if (!patron.surname) {
                return patron.text;
            }
            return (
                escape_str(patron.surname) + ", " + escape_str(patron.firstname)
            );
        },
        placeholder: "Search for a patron"
    });

    // If passed patron, pre-select
    var patron_id = button.data('patron') || 0;
    if (patron_id) {
        var patron = $.ajax({
            url: '/api/v1/patrons/' + patron_id,
            dataType: 'json',
            type: 'GET'
        });

        $.when(patron).then(
            function(patron){
                var newOption = new Option(escape_str(patron.surname) + ", " + escape_str(patron.firstname), patron.patron_id, true, true);
                $('#booking_patron_id').append(newOption).trigger('change');

                // clone patron_id to id (select2 expects an id field)
                patron.id = patron.patron_id;

                // manually trigger the `select2:select` event
                $('#booking_patron_id').trigger({
                    type: 'select2:select',
                    params: {
                        data: patron
                    }
                });
            }
        );
    }

    // Item select2
    $("#booking_item_id").select2({
        dropdownParent: $(".modal-content", "#placeBookingModal"),
        width: '50%',
        dropdownAutoWidth: true,
        minimumResultsForSearch: 20,
        placeholder: "Select item"
    });

    // Adopt flatpickr and update mode
    var periodPicker = $("#period").get(0)._flatpickr;
    periodPicker.set('mode', 'range');

    // Fetch list of bookable items
    var items = $.ajax({
        url: '/api/v1/biblios/' + biblionumber + '/items?bookable=1' + '&_per_page=-1',
        dataType: 'json',
        type: 'GET'
    });

    // Fetch list of existing bookings
    var bookings = $.ajax({
        url: '/api/v1/bookings?biblio_id=' + biblionumber,
        dataType: 'json',
        type: 'GET'
    });

    // Update item select2 and period flatpickr
    $.when(items, bookings).then(
        function(items,bookings){

            // Total bookable items
            var bookable = 0;

            for (item of items[0]) {
                bookable++;
                // Populate item select
                if (!($('#booking_item_id').find("option[value='" + item.item_id + "']").length)) {
                    // Create a DOM Option and de-select by default
                    var newOption = new Option(escape_str(item.external_id), item.item_id, false, false);
                    // Append it to the select
                    $('#booking_item_id').append(newOption);
                }
            }

            // If passed an itemnumber, pre-select
            if (itemnumber) {
                $('#booking_item_id').val(itemnumber);
            }

            // Redraw select with new options and enable
            $('#booking_item_id').trigger('change');
            $("#booking_item_id").prop("disabled", false);

            // Set disabled dates in datepicker
            periodPicker.config.disable.push( function(date) {

                // set local copy of selectedDates
                let selectedDates = periodPicker.selectedDates;

                // set booked counter
                let booked = 0;

                // reset the unavailable items array
                let unavailable_items = [];

                // reset the biblio level bookings array
                let biblio_bookings = [];

                // disable dates before selected date
                if (selectedDates[0] && selectedDates[0] > date) {
                    return true;
                }

                // iterate existing bookings
                for (booking of bookings[0]) {
                    var start_date = flatpickr.parseDate(booking.start_date);
                    var end_date = flatpickr.parseDate(booking.end_date);

                    // patron has selected a start date (end date checks)
                    if (selectedDates[0]) {

                        // new booking start date is between existing booking start and end dates
                        if (selectedDates[0] >= start_date && selectedDates[0] <= end_date) {
                            if (booking.item_id) {
                                if (unavailable_items.indexOf(booking.item_id) === -1) {
                                    unavailable_items.push(booking.item_id);
                                }
                            } else {
                                if (biblio_bookings.indexOf(booking.booking_id) === -1) {
                                    biblio_bookings.push(booking.booking_id);
                                }
                            }
                        }

                        // new booking end date would be between existing booking start and end dates
                        else if (date >= start_date && date <= end_date) {
                            if (booking.item_id) {
                                if (unavailable_items.indexOf(booking.item_id) === -1) {
                                    unavailable_items.push(booking.item_id);
                                }
                            } else {
                                if (biblio_bookings.indexOf(booking.booking_id) === -1) {
                                    biblio_bookings.push(booking.booking_id);
                                }
                            }
                        }

                        // new booking would span existing booking
                        else if (selectedDates[0] <= start_date && date >= end_date) {
                            if (booking.item_id) {
                                if (unavailable_items.indexOf(booking.item_id) === -1) {
                                    unavailable_items.push(booking.item_id);
                                }
                            } else {
                                if (biblio_bookings.indexOf(booking.booking_id) === -1) {
                                    biblio_bookings.push(booking.booking_id);
                                }
                            }
                        }

                        // new booking would not conflict
                        else {
                            continue;
                        }

                        // check that there are available items
                        // available = all bookable items - booked items - booked biblios
                        let total_available = items[0].length - unavailable_items.length - biblio_bookings.length;
                        if (total_available === 0) {
                            return true;
                        }
                    }

                    // patron has not yet selected a start date (start date checks)
                    else if (date <= end_date && date >= start_date) {

                        // same item, disable date
                        if (booking.item_id && booking.item_id == itemnumber) {
                            // Ignore if we're updating an existing booking
                            if (!(booking_id && booking_id == booking.booking_id)){ 
                                return true;
                            }
                        }

                        // count all clashes, both item and biblio level
                        booked++;
                        if (booked == bookable) {
                            return true;
                        }

                        // FIXME: The above is not intelligent enough to spot
                        // cases where an item must be used for a biblio level booking
                        // due to all other items being booking within the biblio level
                        // booking period... we end up with a clash
                        // To reproduce: 
                        // * One bib with two bookable items.
                        // * Add item level booking
                        // * Add biblio level booking that extends one day beyond the item level booking
                        // * Try to book the item without an item level booking from the day before the biblio level
                        //   booking is to be returned. Note this is a clash, the only item available for the biblio
                        //   level booking is the item you just booked out overlapping the end date.
                    }
                }
            });
            
            // Setup listener for item select2
            $('#booking_item_id').on('select2:select', function(e) {
                itemnumber = e.params.data.id ? e.params.data.id : null;

                // redraw pariodPicker taking selected item into account
                periodPicker.redraw();
            });

            // Set onChange for flatpickr
            let exists = periodPicker.config.onChange.filter(f => f.name ==='periodChange');
            if(exists.length === 0) {
                periodPicker.config.onChange.push(function periodChange(selectedDates, dateStr, instance) {
                    if ( selectedDates[0] && selectedDates[1] ) {
                        // set form fields from picker
                        let picker_start = new Date(selectedDates[0]);
                        let picker_end = new Date(selectedDates[1]);
                        picker_end.setHours(picker_end.getHours()+23);
                        picker_end.setMinutes(picker_end.getMinutes()+59);
                        $('#booking_start_date').val(picker_start.toISOString());
                        $('#booking_end_date').val(picker_end.toISOString());
    
                        // set available items in select2
                        var booked_items = bookings[0].filter(function(booking) {
                            let start_date = flatpickr.parseDate(booking.start_date);
                            let end_date = flatpickr.parseDate(booking.end_date);
                            // This booking ends before the start of the new booking
                            if ( end_date <= selectedDates[0] ) {
                                return false;
                            }
                            // This booking starts after then end of the new booking
                            if ( start_date >= selectedDates[1] ) {
                                return false;
                            }
                            // This booking overlaps
                            return true;
                        });
                        $("#booking_item_id > option").each(function() {
                            let option = $(this);
                            if ( itemnumber && itemnumber == option.val() ) {
                                console.log("itemnumber defined and equal to value");
                            } else if ( booked_items.some(function(booked_item){
                                return option.val() == booked_item.item_id;
                            }) ) {
                                option.prop('disabled',true);
                            } else {
                                option.prop('disabled',false);
                            }
                        });
                    }
                });
            };

            // Set booking start & end if this is an edit
            var start_date = button.data('start_date');
            var end_date = button.data('end_date');
            if ( start_date ) {
                // Allow invalid pre-load so setDate can set date range
                //periodPicker.set('allowInvalidPreload', true);
                // FIXME: Why is this the case.. we're passing two valid Date objects

                console.log("Calling setDate with");
                console.log(start_date);
                console.log(end_date);
                let dates = [ new Date(start_date), new Date(end_date) ];
                periodPicker.setDate(dates, true);
            };

            // Enable flatpickr now we have date function populated
            periodPicker.redraw();
            $("#period_fields :input").prop('disabled', false);
        },
        function(jqXHR, textStatus, errorThrown){
            console.log("Fetch failed");
        }
    );
});

$("#placeBookingForm").on('submit', function(e) {
    e.preventDefault();

    var url = '/api/v1/bookings';

    var booking_id = $('#booking_id').val();
    var start_date = $('#booking_start_date').val();
    var end_date = $('#booking_end_date').val();
    var item_id = $('#booking_item_id').val();

    if (!booking_id) {
        var posting = $.post(
            url,
            JSON.stringify({
                "start_date": start_date,
                "end_date": end_date,
                "biblio_id": $('#booking_biblio_id').val(),
                "item_id": item_id != 0 ? item_id : null,
                "patron_id": $('#booking_patron_id').find(':selected').val()
            })
        );
    
        posting.done(function(data) {
            // Update bookings page as required
            if (typeof bookings_table !== 'undefined' && bookings_table !== null) {
                bookings_table.api().ajax.reload();
            }
            if (typeof timeline !== 'undefined' && timeline !== null) {
                let selected_patron = $("#booking_patron_id").select2('data')[0];
                timeline.itemsData.add({
                    id: data.booking_id,
                    booking: data.booking_id,
                    patron: data.patron_id,
                    start: dayjs(data.start_date).toDate(),
                    end: dayjs(data.end_date).toDate(),
                    content: $patron_to_html(selected_patron, {
                        display_cardnumber: true,
                        url: false
                    }),
                    editable: { remove: true, updateTime: true },
                    type: 'range',
                    group: data.item_id ? data.item_id : 0
                });
                timeline.focus(data.booking_id);
            }
    
            // Update bookings counts
            $('.bookings_count').html(parseInt($('.bookings_count').html(), 10)+1);
    
            // Close modal
            $('#placeBookingModal').modal('hide');
        });
    
        posting.fail(function(data) {
            $('#booking_result').replaceWith('<div id="booking_result" class="alert alert-danger">Failure</div>');
        });
    } else {
        url += '/' + booking_id;
        var putting = $.ajax({
            'method': 'PUT',
            'url': url,
            'data': JSON.stringify({
                "booking_id": booking_id,
                "start_date": start_date,
                "end_date": end_date,
                "biblio_id": $('#booking_biblio_id').val(),
                "item_id": item_id != 0 ? item_id : null,
                "patron_id": $('#booking_patron_id').find(':selected').val()
            })
        });
    
        putting.done(function(data) {
            update_success = 1;

            // Update bookings page as required
            if (typeof bookings_table !== 'undefined' && bookings_table !== null) {
                bookings_table.api().ajax.reload();
            }
            if (typeof timeline !== 'undefined' && timeline !== null) {
                let selected_patron = $("#booking_patron_id").select2('data')[0];
                timeline.itemsData.update({
                    id: data.booking_id,
                    booking: data.booking_id,
                    patron: data.patron_id,
                    start: dayjs(data.start_date).toDate(),
                    end: dayjs(data.end_date).toDate(),
                    content: $patron_to_html(selected_patron, {
                        display_cardnumber: true,
                        url: false
                    }),
                    editable: { remove: true, updateTime: true },
                    type: 'range',
                    group: data.item_id ? data.item_id : 0
                });
                timeline.focus(data.booking_id);
            }
    
            // Close modal
            $('#placeBookingModal').modal('hide');
        });
    
        putting.fail(function(data) {
            $('#booking_result').replaceWith('<div id="booking_result" class="alert alert-danger">Failure</div>');
        });
    }
});

$('#placeBookingModal').on('hidden.bs.modal', function (e) {
    $('#booking_patron_id').val(null).trigger('change');
    $('#booking_item_id').val(0).trigger('change');
    $("#period").get(0)._flatpickr.clear();
    $('#booking_start_date').val('');
    $('#booking_end_date').val('');
    $('#booking_id').val('');
})